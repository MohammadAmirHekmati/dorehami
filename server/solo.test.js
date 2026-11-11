import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStorage} from './storage.js';
import {installSolo} from './solo.js';
import {createGame,hint,move} from '../shared/solo-engine.js';
import {points,replay} from '../shared/solo-score.js';
test('score reflects progress, win bonus and non-refundable assists',()=>{const s=createGame('pyramid');s.pyramid[21]=null;s.pyramid[22]=null;s.moves=1;assert.equal(points(s),18);assert.equal(points(s,1,1),3);s.won=true;assert.equal(points(s),518);assert.equal(points(s,1000),0);});
test('replay checks actions and charges undo and hint',()=>{const s=createGame('solitaire');const events=[{type:'draw'},{type:'undo'},{type:'hint'}];assert.deepEqual(replay(s,events),{score:0,moves:0,won:false});assert.throws(()=>replay(s,[{type:'undo'}]));assert.throws(()=>replay(s,[{type:'move',from:{zone:'column',pile:0,index:-1},to:{zone:'foundation',pile:0}}]));assert.throws(()=>replay(s,Array(2001).fill({type:'hint'})));});
test('authenticated records persist, isolate users, replay scores and deduplicate concurrent submissions',async()=>{
 const old=process.cwd();process.chdir(mkdtempSync(join(tmpdir(),'dorehami-records-')));
 const store=await openStorage();process.chdir(old);
 await store.createUser({id:'one',name:'one',password:'test'});await store.createUser({id:'two',name:'two',password:'test'});
 await store.createSession('phone-one','one',Date.now()+60000);await store.createSession('phone-two','one',Date.now()+60000);await store.createSession('other-user','two',Date.now()+60000);
 const app=express();app.use(express.json());installSolo(app,store);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,token,body)=>{const r=await fetch(base+'/api/solo/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 try{
 assert.equal((await request('records','bad')).status,401);
 assert.equal((await request('runs','phone-one',{kind:'bad'})).status,400);
 for(const kind of ['pyramid','solitaire']){
 const {data:run}=await request('runs','phone-one',{kind});let s=run.initial;const events=[];
 for(let i=0;i<20&&!s.won;i++){const a=hint(s);if(!a)break;events.push(a);s=move(s,a);}
 assert.equal((await request('runs/'+run.id+'/finish','other-user',{events})).status,404);
 assert.equal((await request('runs/'+run.id+'/finish','phone-one',{events:[{type:'bogus'}],score:999999})).status,400);
 const results=await Promise.all([request('runs/'+run.id+'/finish','phone-one',{events,score:999999}),request('runs/'+run.id+'/finish','phone-one',{events})]);
 assert.ok(results.every(r=>r.status===200));assert.equal(results[0].data.result.score,points(s));
 const second=(await request('records','phone-two')).data.records.find(r=>r.kind===kind);assert.equal(second.games,1);assert.equal(second.best_score,points(s));
 assert.equal((await request('records','other-user')).data.records.length,0);
 assert.equal((await request('runs/'+run.id+'/finish','phone-one',{events:[]})).data.result.score,points(s));
 const lower=(await request('runs','phone-one',{kind})).data;
 await request('runs/'+lower.id+'/finish','phone-one',{events:[]});
 const aggregate=(await request('records','phone-two')).data.records.find(r=>r.kind===kind);
 assert.equal(aggregate.best_score,points(s));assert.equal(aggregate.games,2);
 }
 const nearWin=createGame('pyramid');nearWin.pyramid.fill(null);nearWin.pyramid[0]={id:'♠13',r:13,s:'♠',up:true};
 await store.createSoloRun('win-fixture','one','pyramid',nearWin);
 const win=(await request('runs/win-fixture/finish','phone-one',{events:[{type:'pair',a:{zone:'pyramid',index:0}}]})).data;
 assert.equal(win.result.won,true);assert.equal(win.result.score,778);
 const record=win.records.find(r=>r.kind==='pyramid');assert.equal(record.wins,1);assert.equal(record.best_moves,1);
 }finally{await new Promise(r=>server.close(r));await store.close();}
});
