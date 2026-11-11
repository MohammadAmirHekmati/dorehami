import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { start,act,view,legal } from './game.js';
import { openStorage } from './storage.js';
import { installAuth } from './auth.js';
import { installSolo } from './solo.js';
const storage = await openStorage();
const app=express(), server=createServer(app);
const origin = process.env.APP_ORIGIN;
const io=new Server(server,{maxHttpBufferSize:16384,allowRequest:(req,done)=>done(null,!origin||!req.headers.origin||req.headers.origin===origin)});
app.disable('x-powered-by');
if(process.env.TRUST_PROXY==='1') app.set('trust proxy','loopback');
app.use('/api/solo',express.json({limit:'256kb'}));
app.use(express.json({limit:'10kb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');next()});
installAuth(app,storage);installSolo(app,storage);
app.get('/api/health',async(_req,res)=>{try{await storage.ping();res.json({ok:true,database:storage.kind})}catch{res.status(503).json({ok:false})}});
const rooms=new Map((await storage.loadRooms()).map(r=>{r.players.forEach(p=>{if(!p.bot)p.connected=false});if(r.phase==='playing')r.deadline=Date.now()+30000;return [r.code,r]}));
const userFromToken=token=>storage.userFromToken(token);
let pending=Promise.resolve();
function persist(room){const snapshot=JSON.parse(JSON.stringify(room));pending=pending.then(()=>storage.saveRoom(snapshot)).catch(()=>console.error('Room persistence failed'));}
function removeRoom(code){rooms.delete(code);pending=pending.then(()=>storage.deleteRoom(code)).catch(()=>console.error('Room removal persistence failed'));}
setInterval(()=>{storage.clean().catch(()=>{});for(const r of rooms.values()){if(!r.players.some(p=>!p.bot&&p.connected)&&Date.now()-(r.updated||r.created)>7200000)removeRoom(r.code)}},60000).unref();
function emit(room){room.updated=Date.now();persist(room);for(const p of room.players){if(!p.bot)io.to('user:'+p.id).emit('room',view(room,p.id))}}
function current(id){return [...rooms.values()].find(r=>r.players.some(p=>p.id===id))}
io.use(async(socket,next)=>{try{const u=await userFromToken(socket.handshake.auth.token);if(!u)return next(Error('ابتدا وارد حساب شوید'));socket.user=u;next()}catch{next(Error('پایگاه داده در دسترس نیست'))}});
io.on('connection',socket=>{const u=socket.user;socket.join('user:'+u.id);let r=current(u.id);if(r){r.players.find(p=>p.id===u.id).connected=true;emit(r)}
let bucket={n:0,time:Date.now()};socket.on('command',(data,reply=()=>{})=>{if(typeof reply!=='function')reply=()=>{};try{if(Date.now()-bucket.time>10000)bucket={n:0,time:Date.now()};if(++bucket.n>40)throw Error('درخواست‌های بیش از حد؛ کمی صبر کنید');let room=current(u.id);if(!data||typeof data.type!=='string')throw Error('درخواست نامعتبر');switch(data.type){case 'create':{if(rooms.size>=200)throw Error('ظرفیت روم‌ها تکمیل است');if(room)throw Error('ابتدا از روم قبلی خارج شوید');if(!['seven','blackjack'].includes(data.game))throw Error('بازی نامعتبر');let code;do{code=randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));room={code,game:data.game,host:u.id,phase:'waiting',players:[{...u,connected:true}],created:Date.now()};rooms.set(code,room);break}case 'join':{if(room)throw Error('شما در یک روم هستید');room=rooms.get(String(data.code).toUpperCase());if(!room)throw Error('رومی با این کد پیدا نشد');if(room.phase!=='waiting'||room.players.length>=4)throw Error('روم پر است یا بازی شروع شده');room.players.push({...u,connected:true});break}case 'bot':{if(!room||room.host!==u.id||room.phase==='playing')throw Error('فقط میزبان می‌تواند حریف اضافه کند');if(room.players.length>=4)throw Error('روم پر است');room.players.push({id:'bot-'+randomBytes(4).toString('hex'),name:['نیما','سارا','آرین'][room.players.filter(p=>p.bot).length]+' · ربات',bot:true,connected:true});break}case 'start':{if(!room||room.host!==u.id||room.phase==='playing')throw Error('شروع بازی در اختیار میزبان است');start(room);break}case 'action':{if(!room)throw Error('رومی وجود ندارد');act(room,u.id,data.action);break}case 'leave':{if(room){if(room.phase==='playing'){room.phase='finished';room.result=`${u.name} از میز خارج شد؛ این دست لغو شد`}room.players=room.players.filter(p=>p.id!==u.id);if(!room.players.some(p=>!p.bot)){removeRoom(room.code)}else{if(room.host===u.id)room.host=room.players.find(p=>!p.bot).id;emit(room)}}io.to('user:'+u.id).emit('room',null);return reply({ok:true})}default:throw Error('درخواست نامعتبر')}emit(room);reply({ok:true})}catch(e){reply({error:e.message})}});
socket.on('disconnect',()=>{if(io.sockets.adapter.rooms.get('user:'+u.id)?.size)return;const r=current(u.id);if(r){r.players.find(p=>p.id===u.id).connected=false;emit(r)}})});
const turnTimer=setInterval(()=>{for(const r of rooms.values()){if(r.phase!=='playing')continue;const p=r.players[r.turn];if((p.bot&&Date.now()>r.deadline-28500)||Date.now()>r.deadline){try{let action;if(r.game==='seven'){const c=p.bot&&p.hand.find(c=>legal(r,c));action=c?{type:'play',card:c.id,suit:p.hand.find(x=>x.r!==11)?.s||'♠'}:{type:'draw'}}else{const {score}=gameHelpers;action={type:p.bot&&score(p.hand)<17?'hit':'stand'}}act(r,p.id,action);emit(r)}catch(e){console.error('Turn processing failed:',e.message)}}}},750);
import * as gameHelpers from './game.js';
if(process.env.NODE_ENV==='production'||process.argv.includes('--production')){app.use(express.static('dist'));app.get('/{*path}',(_,res)=>res.sendFile('index.html',{root:'dist'}))}else{const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares)}
const port=Number(process.env.PORT||3000);server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log('Card club ready on port '+port));
async function shutdown(){clearInterval(turnTimer);io.close();server.close();await pending;await storage.close();process.exit(0)}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
