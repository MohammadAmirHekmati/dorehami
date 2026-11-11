import {randomInt} from 'node:crypto';
export const HOKM_GAMES={hokm2:2,hokm3:3,hokm4:4};
export const isHokm=game=>Object.hasOwn(HOKM_GAMES,game);
const suits=['♠','♥','♦','♣'];
export const strength=c=>c.r===1?14:c.r;
export function hokmDeck(n){
 const cards=suits.flatMap(s=>Array.from({length:13},(_,i)=>({id:s+(i+1),s,r:i+1}))).filter(c=>n!==3||c.id!=='♣2');
 for(let i=cards.length-1;i>0;i--){const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
 const cut=randomInt(1,cards.length);return [...cards.slice(cut),...cards.slice(0,cut)];
}
const side=(r,i)=>r.players.length===4?i%2:i;
const tick=r=>{r.deadline=Date.now()+30000;};
function deal(r,i,n){r.players[i].hand.push(...r.deck.splice(-n));}
function round(r){
 const n=r.players.length;r.deck=hokmDeck(n);r.discard=[];r.captured=[];r.trick=[];r.lastTrick=null;r.tricks=Array(n===4?2:n).fill(0);r.trump=null;r.drawCard=null;r.drawSeen=null;r.roundResult='';r.roundNumber++;r.stage='trump';r.turn=r.hakem;r.players.forEach(p=>{p.hand=[];p.outcome='';});
 deal(r,r.hakem,5);
 if(n!==4)for(let step=1;step<n;step++)deal(r,(r.hakem+step)%n,5);
 tick(r);
}
export function startHokm(r){
 const n=HOKM_GAMES[r.game];if(r.players.length!==n)throw Error(`برای این میز دقیقاً ${n} بازیکن لازم است`);
 // Public ace lottery selects the ruler and (in teams) their partner before a fresh shuffle.
 const lottery=hokmDeck(n);r.lottery=[];let seat=0,hakem=null,partner=null;
 for(const c of lottery){if(seat===hakem)seat=(seat+1)%n;r.lottery.push({id:r.players[seat].id,card:c});if(c.r===1){if(hakem===null){hakem=seat;if(n!==4)break;}else{partner=seat;break;}}seat=(seat+1)%n;}
 if(n===4){const opposite=(hakem+2)%4;[r.players[opposite],r.players[partner]]=[r.players[partner],r.players[opposite]];}
 r.hakem=hakem;r.matchPoints=Array(n===4?2:n).fill(0);r.roundNumber=0;r.phase='playing';r.result='';r.dealer=[];round(r);
}
export function legalHokm(r,player,c){if(r.stage!=='trick')return false;const lead=r.trick[0]?.card.s;return !lead||c.s===lead||!player.hand.some(x=>x.s===lead);}
export function trickWinner(trick,trump){
 const lead=trick[0].card.s;const value=c=>(c.s===trump?200:c.s===lead?100:0)+strength(c);
 return trick.reduce((best,x)=>value(x.card)>value(best.card)?x:best).seat;
}
export function handResult(tricks,n,hakem){
 const total=tricks.reduce((a,b)=>a+b,0),high=Math.max(...tricks),winner=tricks.indexOf(high);
 if(high===7&&total===7)return {winner,points:winner===(n===4?hakem%2:hakem)?2:3};
 if(n!==3)return high>=7?{winner,points:1}:null;
 const remaining=17-total;
 if(tricks.every((x,i)=>i===winner||high>x+remaining))return {winner,points:1};
 if(remaining===0){const tied=tricks.filter(x=>x===high).length;return {winner:tied===2?tricks.findIndex(x=>x!==high):winner,points:1};}
 return null;
}
function beginDraw(r){r.stage='draw';r.turn=r.hakem;r.drawCard=r.deck.pop();tick(r);}
export function actHokm(r,id,a){
 if(!a||typeof a.type!=='string')throw Error('حرکت نامعتبر');
 const p=r.players[r.turn],n=r.players.length;if(p?.id!==id)throw Error('هنوز نوبت شما نیست');
 if(r.stage==='trump'){
  if(a.type!=='trump'||!suits.includes(a.suit))throw Error('خال حکم را انتخاب کن');r.trump=a.suit;
  if(n===2){r.stage='discard';r.discardStep=0;}
  else{if(n===4)for(let step=1;step<n;step++)deal(r,(r.hakem+step)%n,5);for(let batch=0;batch<(n===3?3:2);batch++)for(let step=0;step<n;step++)deal(r,(r.hakem+step)%n,4);r.stage='trick';}
 }else if(r.stage==='discard'){
  const count=r.discardStep===0?3:2;
  if(a.type!=='discard'||!Array.isArray(a.cards)||a.cards.length!==count||new Set(a.cards).size!==count||a.cards.some(id=>!p.hand.some(c=>c.id===id)))throw Error(`دقیقاً ${count} کارت از دست خودت انتخاب کن`);
  r.discard.push(...p.hand.filter(c=>a.cards.includes(c.id)));p.hand=p.hand.filter(c=>!a.cards.includes(c.id));
  if(r.discardStep++===0)r.turn=(r.hakem+1)%2;else beginDraw(r);
 }else if(r.stage==='draw'){
  if(a.type!=='choose'||!['first','second'].includes(a.choice))throw Error('یکی از دو انتخاب را بزن');
  const second=r.deck.pop();if(!second||!r.drawCard)throw Error('دسته نامعتبر است');
  p.hand.push(a.choice==='first'?r.drawCard:second);const discarded=a.choice==='first'?second:r.drawCard;r.discard.push(discarded);r.drawSeen={owner:id,card:discarded};r.drawCard=null;
  if(r.deck.length){r.turn=(r.turn+1)%2;r.drawCard=r.deck.pop();}else{if(r.players.some(x=>x.hand.length!==13))throw Error('تعداد کارت‌ها نامعتبر است');r.stage='trick';r.turn=r.hakem;}
 }else if(r.stage==='trick'){
  const c=p.hand.find(c=>c.id===a.card);if(a.type!=='play'||!c||!legalHokm(r,p,c))throw Error('اگر خال زمین را داری، باید همان خال را بازی کنی');
  p.hand=p.hand.filter(x=>x.id!==c.id);r.trick.push({seat:r.turn,card:c});
  if(r.trick.length===n){const winner=trickWinner(r.trick,r.trump);r.tricks[side(r,winner)]++;r.lastTrick={cards:r.trick,winner};r.captured.push(...r.trick.map(x=>x.card));r.trick=[];r.turn=winner;
   const result=handResult(r.tricks,n,r.hakem);
   if(result){r.matchPoints[result.winner]+=result.points;const label=n===4?`تیم ${result.winner+1}`:r.players[result.winner].name;r.roundResult=`${label} این دست را برد · ${result.points} امتیاز`;r.nextHakem=result.winner===side(r,r.hakem)?r.hakem:(r.hakem+1)%n;r.stage='round-end';r.turn=r.hakem;
    if(r.matchPoints[result.winner]>=7){r.phase='finished';r.result=`${label} برندهٔ مسابقه شد!`;r.players.forEach((p,i)=>p.outcome=side(r,i)===result.winner?'برد':'باخت');}
   }
  }else r.turn=(r.turn+1)%n;
 }else if(r.stage==='round-end'&&a.type==='next'){r.hakem=r.nextHakem;round(r);}
 else throw Error('حرکت در این مرحله مجاز نیست');
 tick(r);
}
export function autoHokm(r){
 const p=r.players[r.turn];
 if(r.stage==='trump'){const best=suits.map(s=>({s,value:p.hand.filter(c=>c.s===s).reduce((a,c)=>a+strength(c),0)})).sort((a,b)=>b.value-a.value)[0];return {type:'trump',suit:best.s};}
 if(r.stage==='discard')return {type:'discard',cards:[...p.hand].sort((a,b)=>(a.s===r.trump?30:0)+strength(a)-(b.s===r.trump?30:0)-strength(b)).slice(0,r.discardStep===0?3:2).map(c=>c.id)};
 if(r.stage==='draw')return {type:'choose',choice:r.drawCard.s===r.trump||strength(r.drawCard)>=11?'first':'second'};
 if(r.stage==='round-end')return {type:'next'};
 return {type:'play',card:[...p.hand].filter(c=>legalHokm(r,p,c)).sort((a,b)=>strength(a)-strength(b))[0].id};
}
export function viewHokm(r,id){
 const me=r.players.find(p=>p.id===id);
 return {code:r.code,game:r.game,host:r.host,phase:r.phase,turn:r.turn,deadline:r.deadline,result:r.result,stage:r.stage,hakem:r.hakem,trump:r.trump,roundNumber:r.roundNumber,matchPoints:r.matchPoints,tricks:r.tricks,trick:r.trick,lastTrick:r.lastTrick,roundResult:r.roundResult,lottery:r.lottery,stockCount:r.deck?.length||0,discardCount:r.discard?.length||0,discardNeed:r.stage==='discard'?(r.discardStep===0?3:2):0,drawCard:r.stage==='draw'&&r.players[r.turn].id===id?r.drawCard:undefined,drawSeen:r.drawSeen?.owner===id?r.drawSeen.card:undefined,legalCards:r.phase==='playing'&&r.players[r.turn]?.id===id&&me?me.hand.filter(c=>legalHokm(r,me,c)).map(c=>c.id):[],players:r.players.map((p,i)=>({id:p.id,name:p.name,bot:p.bot,connected:p.connected,seat:i,team:r.players.length===4?i%2:undefined,count:p.hand?.length||0,hand:p.id===id?p.hand:undefined,outcome:p.outcome}))};
}
