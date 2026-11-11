import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {hint,move} from '../shared/solo-engine.js';
import {points} from '../shared/solo-score.js';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3002';
const call=async(path,token,body)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
const name='score-test-'+Date.now(),password=randomBytes(16).toString('hex');
const first=await call('/api/auth',null,{mode:'register',name,password});assert.equal(first.status,200);
const second=await call('/api/auth',null,{mode:'login',name,password});assert.equal(second.status,200);assert.notEqual(first.data.token,second.data.token);
const other=await call('/api/auth',null,{mode:'register',name:name+'-b',password});assert.equal(other.status,200);
assert.equal((await call('/api/solo/records',null)).status,401);
for(const kind of ['solitaire','pyramid']){
 const start=await call('/api/solo/runs',first.data.token,{kind});assert.equal(start.status,200);
 const run=start.data;let state=run.initial;const events=[];
 for(let i=0;i<35&&!state.won;i++){const action=hint(state);if(!action)break;events.push(action);state=move(state,action);}
 assert.equal((await call('/api/solo/runs/'+run.id+'/finish',other.data.token,{events})).status,404);
 assert.equal((await call('/api/solo/runs/'+run.id+'/finish',first.data.token,{events:[{type:'invalid'}]})).status,400);
 const path='/api/solo/runs/'+run.id+'/finish';
 const results=await Promise.all([call(path,first.data.token,{events,score:999999}),call(path,first.data.token,{events})]);
 assert.ok(results.every(r=>r.status===200));assert.equal(results[0].data.result.score,points(state));
 const records=(await call('/api/solo/records',second.data.token)).data.records;
 const record=records.find(r=>r.kind===kind);assert.equal(record.best_score,points(state));assert.equal(record.games,1);
 assert.equal((await call('/api/solo/records',other.data.token)).data.records.length,0);
 console.log('PASS',kind,'PostgreSQL score replay, duplicate protection, ownership and second-session records');
}
