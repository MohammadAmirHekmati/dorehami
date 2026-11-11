import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deck,score,start,act,view,legal} from './game.js';
const make=(game='seven')=>({game,players:[{id:'a',name:'A'},{id:'b',name:'B'}]});
test('two to four player deals and redeals preserve a complete shuffled deck',()=>{
 const orders=new Set();for(const game of ['seven','blackjack'])for(let count=2;count<=4;count++)for(let trial=0;trial<30;trial++){
 const r={game,players:Array.from({length:count},(_,i)=>({id:String(i),name:String(i)}))};start(r);start(r);
 assert.ok(r.players.every(p=>p.hand.length===(game==='seven'?7:2)));
 const cards=[...r.deck,...r.discard,...r.dealer,...r.players.flatMap(p=>p.hand)];assert.equal(cards.length,52);assert.equal(new Set(cards.map(c=>c.id)).size,52);orders.add(cards.map(c=>c.id).join(','));
 }assert.ok(orders.size>170);
});
test('deck is 52 unique cards',()=>assert.equal(new Set(deck().map(c=>c.id)).size,52));
test('aces are reduced without busting',()=>{assert.equal(score([{r:1},{r:1},{r:9}]),21);assert.equal(score([{r:1},{r:13},{r:7}]),18)});
test('private views never expose opponent hand or deck',()=>{const r=make();start(r);const v=view(r,'a');assert.equal(v.players[0].hand.length,7);assert.equal(v.players[1].hand,undefined);assert.equal(v.deck,undefined);assert.throws(()=>act(r,'b',{type:'draw'}))});
test('seven penalties stack and draw clears them',()=>{const r=make();start(r);r.players[0].hand=[{id:'x',r:7,s:'♣'},{id:'y',r:2,s:'♣'}];r.suit='♣';act(r,'a',{type:'play',card:'x'});assert.equal(r.penalty,2);const n=r.players[1].hand.length;act(r,'b',{type:'draw'});assert.equal(r.players[1].hand.length,n+2);assert.equal(r.penalty,0);assert.equal(r.turn,0)});
test('wild requires valid suit and illegal move preserves hand',()=>{const r=make();start(r);r.players[0].hand=[{id:'j',r:11,s:'♠'},{id:'x',r:3,s:'♦'}];r.suit='♥';r.discard=[{r:4,s:'♥'}];assert.throws(()=>act(r,'a',{type:'play',card:'x'}));assert.throws(()=>act(r,'a',{type:'play',card:'j',suit:'bad'}));assert.equal(r.players[0].hand.length,2)});
test('blackjack hides dealer card then settles each player',()=>{const r=make('blackjack');start(r);assert.equal(view(r,'a').dealer[0],null);act(r,'a',{type:'stand'});act(r,'b',{type:'stand'});assert.equal(r.phase,'finished');assert.ok(r.players.every(p=>['برد','باخت','مساوی'].includes(p.outcome)));assert.ok(view(r,'a').dealer[0])});
test('automated full matches terminate with all 52 cards conserved',()=>{for(const game of ['seven','blackjack']){for(let trial=0;trial<20;trial++){const r=make(game);start(r);for(let i=0;i<10000&&r.phase==='playing';i++){const p=r.players[r.turn];const c=game==='seven'&&p.hand.find(c=>legal(r,c));act(r,p.id,game==='blackjack'?{type:score(p.hand)<17?'hit':'stand'}:c?{type:'play',card:c.id,suit:'♠'}:{type:'draw'});assert.equal(r.deck.length+r.discard.length+r.dealer.length+r.players.reduce((n,p)=>n+p.hand.length,0),52)}assert.equal(r.phase,'finished')}}});
