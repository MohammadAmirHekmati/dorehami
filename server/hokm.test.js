import {test} from 'node:test';
import assert from 'node:assert/strict';
import {start,act,view} from './game.js';
import {hokmDeck,autoHokm,handResult,trickWinner,legalHokm} from './hokm.js';
const make=n=>({code:'TEST',game:'hokm'+n,host:'p0',phase:'waiting',players:Array.from({length:n},(_,i)=>({id:'p'+i,name:'P'+i,connected:true}))});
const card=(r,s='♠')=>({id:s+r,r,s});
const allCards=r=>[...r.deck,...r.discard,...r.captured,...r.players.flatMap(p=>p.hand),...(r.drawCard?[r.drawCard]:[]),...r.trick.map(x=>x.card)];
function conserve(r){const cards=allCards(r);assert.equal(cards.length,r.players.length===3?51:52);assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);}
function step(r){act(r,r.players[r.turn].id,autoHokm(r));conserve(r);}
test('cryptographic shuffle contains each card once; three-player deck omits only club two',()=>{const orders=new Set();for(const n of [2,3,4])for(let i=0;i<100;i++){const d=hokmDeck(n);assert.equal(d.length,n===3?51:52);assert.equal(new Set(d.map(c=>c.id)).size,d.length);assert.equal(d.some(c=>c.id==='♣2'),n!==3);orders.add(d.map(c=>c.id).join(','));}assert.equal(orders.size,300);});
test('exact seat counts are enforced; first five only determine trumps and teams sit opposite',()=>{
 for(const n of [2,3,4]){const r=make(n);const wrong=make(n);wrong.players.pop();assert.throws(()=>start(wrong));start(r);conserve(r);assert.equal(r.stage,'trump');assert.equal(r.players[r.hakem].hand.length,5);
 assert.deepEqual(r.players.map((p,i)=>p.hand.length),r.players.map((p,i)=>n===4&&i!==r.hakem?0:5));
 const aces=r.lottery.filter(x=>x.card.r===1);assert.equal(aces[0].id,r.players[r.hakem].id);if(n===4)assert.equal(aces[1].id,r.players[(r.hakem+2)%4].id);
 const old=structuredClone(r);assert.throws(()=>act(r,r.players[(r.turn+1)%n].id,{type:'trump',suit:'♠'}));assert.deepEqual(r,old);assert.throws(()=>act(r,r.players[r.turn].id,{type:'trump',suit:'bad'}));assert.deepEqual(r,old);
 step(r);if(n>2){assert.ok(r.players.every(p=>p.hand.length===(n===3?17:13)));assert.equal(r.deck.length,0);assert.equal(r.turn,r.hakem);}
 }
});
test('two-player selection keeps exactly thirteen each and never exposes opponents cards',()=>{
 for(const choose of ['first','second']){const r=make(2);start(r);step(r);assert.equal(r.stage,'discard');const original=structuredClone(r);assert.throws(()=>act(r,r.players[r.turn].id,{type:'discard',cards:Array(3).fill(r.players[r.turn].hand[0].id)}));assert.deepEqual(r,original);step(r);step(r);assert.equal(r.stage,'draw');assert.deepEqual(r.players.map((p,i)=>p.hand.length),r.players.map((p,i)=>i===r.hakem?2:3));
 let picks=0;while(r.stage==='draw'){const actor=r.players[r.turn].id,other=r.players[1-r.turn].id,first=r.drawCard,second=r.deck.at(-1);const publicView=JSON.parse(JSON.stringify(view(r,other)));assert.equal(publicView.drawCard,undefined);assert.equal(publicView.players.find(p=>p.id===actor).hand,undefined);assert.equal(publicView.deck,undefined);assert.equal(publicView.discard,undefined);assert.ok(view(r,actor).drawCard);
 act(r,actor,{type:'choose',choice:choose});assert.ok(r.players.find(p=>p.id===actor).hand.some(c=>c.id===(choose==='first'?first:second).id));assert.equal(view(r,other).drawSeen?.id,undefined);conserve(r);picks++;}
 assert.equal(picks,21);assert.ok(r.players.every(p=>p.hand.length===13));assert.equal(r.discard.length,26);assert.equal(r.deck.length,0);assert.equal(r.turn,r.hakem);
 }
});
test('follow suit is compulsory; trumps cut only when void; ace beats king',()=>{
 const r=make(4);start(r);step(r);r.stage='trick';r.trick=[{seat:0,card:card(13,'♥')}];r.turn=1;r.trump='♠';r.players[1].hand=[card(2,'♥'),card(1)];assert.equal(legalHokm(r,r.players[1],card(1)),false);const before=structuredClone(r);assert.throws(()=>act(r,r.players[1].id,{type:'play',card:'♠1'}));assert.deepEqual(r,before);assert.equal(legalHokm(r,{hand:[card(1)]},card(1)),true);
 assert.equal(trickWinner([{seat:0,card:card(13,'♥')},{seat:1,card:card(1,'♥')},{seat:2,card:card(12,'♥')},{seat:3,card:card(1,'♦')}],'♣'),1);
 assert.equal(trickWinner([{seat:0,card:card(1,'♥')},{seat:1,card:card(2)},{seat:2,card:card(13)},{seat:3,card:card(1,'♦')}],'♠'),2);
});
test('kot, ruler-koti and three-player tie and irreversible lead rules',()=>{
 assert.deepEqual(handResult([7,0],4,0),{winner:0,points:2});assert.deepEqual(handResult([0,7],4,0),{winner:1,points:3});assert.deepEqual(handResult([7,4],2,0),{winner:0,points:1});
 assert.equal(handResult([7,4,3],3,0),null);assert.deepEqual(handResult([7,4,4],3,0),{winner:0,points:1});assert.equal(handResult([8,3,1],3,0),null);assert.deepEqual(handResult([8,2,2],3,0),{winner:0,points:1});
 for(const counts of [[6,6,5],[7,7,3],[8,8,1]])assert.deepEqual(handResult(counts,3,0),{winner:2,points:1});assert.deepEqual(handResult([0,0,7],3,0),{winner:2,points:3});
});
test('complete matches terminate, preserve cards, rotate rulers and survive JSON restart',()=>{
 for(const n of [2,3,4])for(let trial=0;trial<12;trial++){
 let r=make(n);start(r);let steps=0;
 while(r.phase==='playing'&&steps++<5000){
 if(r.stage==='round-end'){const oldHakem=r.hakem,oldPoints=[...r.matchPoints],expected=r.nextHakem;step(r);assert.equal(r.hakem,expected);assert.ok(expected===oldHakem||expected===(oldHakem+1)%n);assert.deepEqual(r.matchPoints,oldPoints);}else step(r);
 if(steps%13===0)r=JSON.parse(JSON.stringify(r));
 for(const p of r.players){const v=JSON.parse(JSON.stringify(view(r,p.id)));assert.equal(v.players.filter(x=>x.hand).length,1);assert.equal(v.captured,undefined);assert.equal(v.deck,undefined);}
 }
 assert.equal(r.phase,'finished');assert.ok(Math.max(...r.matchPoints)>=7);assert.ok(r.players.some(p=>p.outcome==='برد'));assert.throws(()=>act(r,r.players[r.turn].id,{type:'next'}));
 }
});
