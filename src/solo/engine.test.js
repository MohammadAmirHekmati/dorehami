import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,shuffledDeck,move,exposed,hint} from './engine.js';
const card=(r,s='♠',up=true)=>({id:s+r,r,s,up});
const empty=()=>({...createGame('solitaire'),stock:[],waste:[],columns:Array.from({length:7},()=>[]),foundations:Array.from({length:4},()=>[])});
test('hint does not bounce the screenshot sequence between equivalent red fours',()=>{
 const s=empty();s.columns[0]=[card(6,'♥'),card(5,'♣'),card(4,'♥')];s.columns[1]=[card(6,'♦'),card(5),card(4,'♦'),card(3),card(2,'♥')];
 s.stock=[card(9)];assert.equal(hint(s),null);
 const manual=move(s,{type:'move',from:{zone:'column',pile:1,index:3},to:{zone:'column',pile:0}});
 assert.ok(manual);assert.equal(hint(manual),null);
});
test('hint scans the entire stock before recommending draw and stops an unproductive cycle',()=>{
 const s=empty();s.stock=[card(1),card(9),card(8)];assert.deepEqual(hint(s),{type:'draw'});
 const blocked=empty();blocked.stock=[card(9),card(8)];assert.equal(hint(blocked),null);
 let n=blocked;for(let i=0;i<12;i++)n=move(n,{type:'draw'});assert.equal(hint(n),null);
});
test('hint still reveals covered cards and frees cards ready for foundations',()=>{
 const s=empty();s.columns[0]=[card(8,'♣',false),card(3),card(2,'♥')];s.columns[1]=[card(4,'♦')];assert.equal(hint(s).from.index,1);
 s.columns[0][0]=card(1,'♣');assert.equal(hint(s).from.index,1);
});
test('repeated shuffles and both deals preserve every rank and suit exactly once',()=>{
 const orders=new Set();for(let i=0;i<100;i++){const deck=shuffledDeck();orders.add(deck.map(c=>c.id).join(','));for(const kind of ['solitaire','pyramid']){const s=createGame(kind,deck),cards=[...s.stock,...s.columns.flat(),...s.pyramid];assert.equal(cards.length,52);assert.equal(new Set(cards.map(c=>c.id)).size,52);for(const suit of ['♠','♥','♦','♣'])assert.deepEqual(cards.filter(c=>c.s===suit).map(c=>c.r).sort((a,b)=>a-b),Array.from({length:13},(_,j)=>j+1));}}assert.ok(orders.size>95);
});
test('deals 52 distinct cards and exposes only tableau tops',()=>{const s=createGame('solitaire');assert.equal(s.stock.length,24);assert.deepEqual(s.columns.map(p=>p.length),[1,2,3,4,5,6,7]);assert.ok(s.columns.every(p=>p.filter(c=>c.up).length===1));assert.equal(new Set(shuffledDeck().map(c=>c.id)).size,52);});
test('draw and recycle preserve order and do not mutate input',()=>{const s=empty();s.stock=[card(1),card(2)];const a=move(s,{type:'draw'}),b=move(a,{type:'draw'}),c=move(b,{type:'draw'});assert.equal(s.stock.length,2);assert.deepEqual(c.stock,s.stock);assert.equal(move(c,{type:'draw'}).waste[0].r,2)});
test('tableau requires alternating colors and descending ranks',()=>{const s=empty();s.columns[0]=[card(8,'♥')];s.waste=[card(7)];const a={type:'move',from:{zone:'waste'},to:{zone:'column',pile:0}};assert.equal(move(s,a).columns[0].length,2);s.waste=[card(7,'♦')];assert.equal(move(s,a),null);s.waste=[card(6)];assert.equal(move(s,a),null)});
test('moving a sequence reveals the covered card and only kings fill empty columns',()=>{const s=empty();s.columns[0]=[card(4,'♣',false),card(13),card(12,'♥')];const a={type:'move',from:{zone:'column',pile:0,index:1},to:{zone:'column',pile:1}};const n=move(s,a);assert.equal(n.columns[1].length,2);assert.equal(n.columns[0][0].up,true);assert.equal(move(s,{...a,from:{zone:'column',pile:0,index:2}}),null);assert.equal(move(s,{...a,to:{zone:'column',pile:0}}),null)});
test('covered and malformed sequences cannot move',()=>{const s=empty();s.columns[0]=[card(13,'♠',false)];assert.equal(move(s,{type:'move',from:{zone:'column',pile:0,index:0},to:{zone:'column',pile:1}}),null);s.columns[0]=[card(13),card(11,'♥')];assert.equal(move(s,{type:'move',from:{zone:'column',pile:0,index:0},to:{zone:'column',pile:1}}),null)});
test('foundations require exact suit and rank; last card can move back',()=>{const s=empty();s.waste=[card(1)];const a={type:'move',from:{zone:'waste'},to:{zone:'foundation',pile:0}};const n=move(s,a);assert.equal(n.foundations[0].length,1);assert.equal(move(s,{...a,to:{zone:'foundation',pile:1}}),null);n.columns[0]=[card(2,'♥')];assert.equal(move(n,{type:'move',from:{zone:'foundation',pile:0},to:{zone:'column',pile:0}}).columns[0].length,2)});
test('solitaire wins only after all four foundations are complete',()=>{const s=empty();s.foundations=['♠','♥','♦','♣'].map(s=>Array.from({length:13},(_,i)=>card(i+1,s)));s.waste=[s.foundations[0].pop()];const n=move(s,{type:'move',from:{zone:'waste'},to:{zone:'foundation',pile:0}});assert.equal(n.won,true);assert.equal(move(n,{type:'draw'}),null)});
test('pyramid only exposes cards with both children removed',()=>{const s=createGame('pyramid');assert.equal(s.pyramid.length,28);assert.equal(s.stock.length,24);assert.equal(exposed(s,20),false);assert.equal(exposed(s,21),true);s.pyramid[26]=null;assert.equal(exposed(s,20),false);s.pyramid[27]=null;assert.equal(exposed(s,20),true)});
test('pyramid accepts pairs totaling 13 and individual kings, rejects same-card pairs',()=>{const s=createGame('pyramid');s.pyramid[21]=card(6);s.pyramid[22]=card(7,'♥');s.pyramid[23]=card(13);const a={zone:'pyramid',index:21},b={zone:'pyramid',index:22};assert.equal(move(s,{type:'pair',a,b}).pyramid[21],null);assert.equal(move(s,{type:'pair',a,b:a}),null);assert.equal(move(s,{type:'pair',a:{zone:'pyramid',index:23}}).pyramid[23],null);assert.equal(move(s,{type:'pair',a}),null)});
test('waste pairs with exposed pyramid cards and recycling is limited',()=>{const s=createGame('pyramid');s.stock=[];s.waste=[card(12)];s.pyramid[21]=card(1,'♥');assert.equal(move(s,{type:'pair',a:{zone:'waste'},b:{zone:'pyramid',index:21}}).waste.length,0);const n=move(s,{type:'draw'});assert.equal(n.redeals,1);assert.equal(move(move(n,{type:'draw'}),{type:'draw'}),null)});
test('pyramid victory does not require emptying the stock',()=>{const s=createGame('pyramid');s.pyramid.fill(null);s.pyramid[0]=card(13);const n=move(s,{type:'pair',a:{zone:'pyramid',index:0}});assert.equal(n.won,true);assert.equal(n.stock.length,24)});
test('hints are legal and repeated play conserves cards',()=>{for(const kind of ['solitaire','pyramid'])for(let trial=0;trial<8;trial++){let s=createGame(kind);for(let i=0;i<100;i++){const action=hint(s);if(!action)break;const n=move(s,action);assert.ok(n);s=n;const cards=[...s.stock,...s.waste,...s.columns.flat(),...s.foundations.flat(),...s.pyramid.filter(Boolean)];assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);if(kind==='solitaire')assert.equal(cards.length,52)}}});
