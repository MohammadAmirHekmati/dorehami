import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3003';
const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out waiting for room state');};
async function client(name){const response=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,password:'HokmTest2026',mode:'register'})});assert.equal(response.status,200);const {token,user}=await response.json();const c={user,view:null};c.socket=io(base,{auth:{token},transports:['websocket'],reconnection:false});c.socket.on('room',r=>c.view=r);await new Promise((resolve,reject)=>{c.socket.once('connect',resolve);c.socket.once('connect_error',reject)});c.command=body=>new Promise((resolve,reject)=>c.socket.timeout(5000).emit('command',body,(e,result)=>e?reject(e):resolve(result)));return c;}
for(const n of [2,3,4]){
 const clients=[];try{
 for(let i=0;i<n;i++)clients.push(await client('hk'+Date.now().toString(36)+'-'+n+i));
 assert.equal((await clients[0].command({type:'create',game:'hokm'+n})).ok,true);
 await wait(()=>clients[0].view?.code);const code=clients[0].view.code;
 assert.ok((await clients[0].command({type:'start'})).error);
 for(let i=1;i<n;i++)assert.equal((await clients[i].command({type:'join',code})).ok,true);
 assert.ok((await clients[0].command({type:'bot'})).error);
 assert.equal((await clients[0].command({type:'start'})).ok,true);
 await wait(()=>clients.every(c=>c.view?.stage==='trump'));
 const initial=clients[0].view,actorId=initial.players[initial.turn].id;
 assert.ok((await clients.find(c=>c.user.id!==actorId).command({type:'action',action:{type:'trump',suit:'♠'}})).error);
 const ruler=clients.find(c=>c.user.id===actorId);assert.equal(ruler.view.players.find(p=>p.id===actorId).hand.length,5);
 assert.equal((await ruler.command({type:'action',action:{type:'trump',suit:'♠'}})).ok,true);
 let actions=0;
 while(actions++<130){
  await wait(()=>clients.every(c=>c.view?.stage===clients[0].view.stage&&c.view?.turn===clients[0].view.turn));
  const r=clients[0].view;if(r.stage==='round-end'||r.phase==='finished')break;
  const c=clients.find(c=>c.user.id===r.players[r.turn].id),v=c.view,hand=v.players.find(p=>p.id===c.user.id).hand;
  for(const peer of clients){const visible=JSON.parse(JSON.stringify(peer.view));assert.equal(visible.players.filter(p=>p.hand).length,1);assert.equal(visible.deck,undefined);assert.equal(visible.discard,undefined);if(peer!==c)assert.equal(visible.drawCard,undefined);}
  let action;
  if(v.stage==='discard')action={type:'discard',cards:hand.slice(0,v.discardNeed).map(c=>c.id)};
  else if(v.stage==='draw'){assert.ok(v.drawCard);action={type:'choose',choice:'first'};}
  else{assert.equal(v.stage,'trick');assert.ok(v.legalCards.length);const illegal=hand.find(x=>!v.legalCards.includes(x.id));if(illegal)assert.ok((await c.command({type:'action',action:{type:'play',card:illegal.id}})).error);action={type:'play',card:v.legalCards[0]};}
  const prior=JSON.stringify(c.view);assert.equal((await c.command({type:'action',action})).ok,true);await wait(()=>JSON.stringify(c.view)!==prior);
 }
 assert.ok(actions<130);assert.ok(clients[0].view.matchPoints.some(x=>x>0));
 const reconnect=clients[0];const saved=reconnect.view;reconnect.socket.disconnect();reconnect.view=null;reconnect.socket.connect();await wait(()=>reconnect.socket.connected);await wait(()=>reconnect.view?.code===code);assert.equal(reconnect.view.roundNumber,saved.roundNumber);
 console.log('PASS hokm'+n+': seat limits, private hands, legal play, full round, scoring and reconnect');
 }finally{if(clients[0]?.socket.connected)await clients[0].command({type:'leave'});for(const c of clients){if(c.socket.connected&&c.view)await c.command({type:'leave'});c.socket.disconnect();}}
}
