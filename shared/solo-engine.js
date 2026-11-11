export const SUITS = ['♠', '♥', '♦', '♣'];
export const red = c => c.s === '♥' || c.s === '♦';
export const label = c => `${({1:'A',11:'J',12:'Q',13:'K'})[c.r] || c.r} ${c.s}`;
export function shuffledDeck() {
  const cards = SUITS.flatMap(s => Array.from({length:13},(_,i)=>({id:s+(i+1),s,r:i+1,up:true})));
  for(let i=51;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
  return cards;
}
export function createGame(kind, deck = shuffledDeck()) {
  const cards=structuredClone(deck);
  const state={version:1,kind,moves:0,won:false,waste:[],stock:[],foundations:[[],[],[],[]],columns:[],pyramid:[],redeals:0};
  if(kind==='solitaire') for(let i=0;i<7;i++) state.columns.push(Array.from({length:i+1},(_,j)=>({...cards.pop(),up:j===i})));
  else state.pyramid=cards.splice(0,28);
  state.stock=cards;
  return state;
}
export function exposed(state,index) {
  if(!state.pyramid[index])return false;
  let row=0;while((row+1)*(row+2)/2<=index)row++;
  return row===6||(!state.pyramid[index+row+1]&&!state.pyramid[index+row+2]);
}
export function cardAt(state,ref) {
  if(ref.zone==='pyramid') return exposed(state,ref.index)?state.pyramid[ref.index]:null;
  if(ref.zone==='waste') return state.waste.at(-1);
  if(ref.zone==='foundation') return state.foundations[ref.pile]?.at(-1);
  return state.columns[ref.pile]?.[ref.index];
}
function sourceCards(state,ref) {
  if(!ref)return [];
  if(ref.zone==='foundation'&&(!Number.isInteger(ref.pile)||ref.pile<0||ref.pile>3))return [];
  if(ref.zone==='waste'||ref.zone==='foundation') {const c=cardAt(state,ref);return c?[c]:[];}
  if(ref.zone!=='column')return [];
  if(!Number.isInteger(ref.pile)||ref.pile<0||ref.pile>6||!Number.isInteger(ref.index)||ref.index<0)return [];
  const cards=state.columns[ref.pile]?.slice(ref.index)||[];
  return cards.every((c,i)=>c.up&&(!i||(cards[i-1].r===c.r+1&&red(cards[i-1])!==red(c))))?cards:[];
}
function removeSource(state,ref) {
  if(ref.zone==='waste') state.waste.pop();
  if(ref.zone==='foundation') state.foundations[ref.pile].pop();
  if(ref.zone==='column') {state.columns[ref.pile].splice(ref.index);const top=state.columns[ref.pile].at(-1);if(top)top.up=true;}
  if(ref.zone==='pyramid')state.pyramid[ref.index]=null;
}
export function move(state,action) {
  if(state.won)return null;
  const next=structuredClone(state);
  if(action.type==='draw') {
    if(next.stock.length)next.waste.push(next.stock.pop());
    else if(next.waste.length&&(next.kind==='solitaire'||next.redeals<1)){next.stock=next.waste.reverse();next.waste=[];next.redeals++;}
    else return null;
  } else if(state.kind==='pyramid'&&action.type==='pair') {
    const a=cardAt(state,action.a),b=action.b&&cardAt(state,action.b);
    if(!['pyramid','waste'].includes(action.a.zone)||action.b&&!['pyramid','waste'].includes(action.b.zone))return null;
    if(!a|| (action.b?(!b||a.id===b.id||a.r+b.r!==13):a.r!==13))return null;
    removeSource(next,action.a);if(action.b)removeSource(next,action.b);
  } else if(state.kind==='solitaire'&&action.type==='move') {
    const cards=sourceCards(state,action.from);if(!cards.length)return null;
    const to=action.to;
    if(to.zone===action.from.zone&&to.pile===action.from.pile)return null;
    if(to.zone==='foundation') {
      const pile=state.foundations[to.pile];if(!pile||cards.length!==1)return null;
      const top=pile.at(-1),c=cards[0];
      if(c.s!==SUITS[to.pile]||c.r!==(top?top.r+1:1))return null;
      next.foundations[to.pile].push(...cards);
    } else if(to.zone==='column') {
      const pile=state.columns[to.pile];if(!pile)return null;
      const top=pile.at(-1),c=cards[0];
      if(top?(!top.up||top.r!==c.r+1||red(top)===red(c)):c.r!==13)return null;
      next.columns[to.pile].push(...cards);
    } else return null;
    removeSource(next,action.from);
  } else return null;
  next.moves++;
  next.won=next.kind==='pyramid'?next.pyramid.every(c=>!c):next.foundations.every(p=>p.length===13);
  return next;
}
function immediateHint(state) {
  if(state.won)return null;
  if(state.kind==='pyramid') {
    const refs=state.pyramid.flatMap((c,i)=>exposed(state,i)?[{zone:'pyramid',index:i}]:[]);
    if(state.waste.length)refs.push({zone:'waste'});
    for(let i=0;i<refs.length;i++) {
      if(cardAt(state,refs[i]).r===13)return {type:'pair',a:refs[i]};
      for(let j=i+1;j<refs.length;j++)if(cardAt(state,refs[i]).r+cardAt(state,refs[j]).r===13)return {type:'pair',a:refs[i],b:refs[j]};
    }
  } else {
    const refs=state.columns.flatMap((pile,p)=>pile.flatMap((c,i)=>c.up?[{zone:'column',pile:p,index:i}]:[]));
    if(state.waste.length)refs.unshift({zone:'waste'});
    for(const from of refs)for(let pile=0;pile<4;pile++){const a={type:'move',from,to:{zone:'foundation',pile}};if(move(state,a))return a;}
    for(const from of refs)for(let pile=0;pile<7;pile++) {
      // Moving an exposed sequence between equivalent columns adds no progress.
      // Only recommend it when it uncovers a card or frees a foundation-ready card.
      if(from.zone==='column'){
        const below=state.columns[from.pile][from.index-1];
        if(!below)continue;
        if(below.up&&below.r!==state.foundations[SUITS.indexOf(below.s)].length+1)continue;
      }
      const a={type:'move',from,to:{zone:'column',pile}};if(move(state,a))return a;
    }
  }
  return null;
}
export function hint(input){
  // UI metadata can contain thousands of recorded actions; keep lookahead bounded.
  const {record,metrics,...state}=input;
  const direct=immediateHint(state);if(direct)return direct;
  let next=state;
  const seen=new Set();
  for(let i=0;i<2*(state.stock.length+state.waste.length)+2;i++){
    next=move(next,{type:'draw'});if(!next)return null;
    const key=JSON.stringify([next.stock.map(c=>c.id),next.waste.map(c=>c.id)]);
    if(seen.has(key))return null;seen.add(key);
    if(immediateHint(next))return {type:'draw'};
  }
  return null;
}
