import assert from 'node:assert/strict';
import {restore} from '../shared/solo-score.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3002';
const name='cp-'+Date.now(),password='CheckpointTest2026';
async function request(path,token,body){const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
const first=await request('auth',null,{name,password,mode:'register'});
assert.equal(first.status,200,JSON.stringify(first.data));
const phone=first.data.token;
const laptop=(await request('auth',null,{name,password,mode:'login'})).data.token;
const outsider=(await request('auth',null,{name:name+'-b',password,mode:'register'})).data.token;
for(const kind of ['solitaire','pyramid']){
 const path='solo/progress/'+kind;
 assert.equal((await request(path,outsider)).data.progress,null);
 const starts=await Promise.all([request(path,phone,{action:'new',revision:null}),request(path,laptop,{action:'new',revision:null})]);
 assert.deepEqual(starts.map(r=>r.status).sort(),[200,409]);
 let p=starts.find(r=>r.status===200).data.progress;
 const events=[{type:'draw'},{type:'hint'},{type:'draw'},{type:'undo'}];
 const body={action:'save',id:p.record.id,revision:p.record.revision,events};
 const saved=await request(path,phone,body);assert.equal(saved.status,200);p=saved.data.progress;
 assert.deepEqual((await request(path,laptop)).data.progress,p);
 assert.deepEqual(p.state,restore(p.initial,events).state);
 assert.deepEqual(p.history,restore(p.initial,events).history);
 assert.deepEqual(p.metrics,{hints:1,undos:1});
 assert.equal((await request(path,phone,body)).data.progress.record.revision,p.record.revision);
 assert.equal((await request(path,outsider,body)).status,409);
 assert.equal((await request(path,phone,{...body,events:[...events,{type:'hint'}]})).status,409);
 assert.equal((await request(path,laptop,{...body,revision:p.record.revision,events:[{type:'bogus'}]})).status,400);
 const continued=[...events,{type:'draw'}];
 const next=(await request(path,laptop,{...body,revision:p.record.revision,events:continued})).data.progress;
 assert.equal((await request(path,phone,{action:'finish',id:p.record.id,revision:p.record.revision,events})).status,409);
 const finalBody={action:'finish',id:next.record.id,revision:next.record.revision,events:continued};
 const finished=await request(path,laptop,finalBody);assert.equal(finished.status,200);assert.equal(finished.data.progress.record.submitted,true);
 assert.equal((await request(path,laptop,finalBody)).status,200);
 assert.equal((await request('solo/records',phone)).data.records.find(r=>r.kind===kind).games,1);
 const renewed=await request(path,phone,{action:'new',revision:finished.data.progress.record.revision});assert.equal(renewed.status,200);
 assert.notEqual(renewed.data.progress.record.id,next.record.id);
 assert.equal((await request(path,laptop,finalBody)).status,409);
 console.log('PASS '+kind+': cross-device layout, undo, hints, isolation, concurrent create, stale saves, retry, finish, restart');
}
