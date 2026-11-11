import {move} from './solo-engine.js';
export function points(state, hints=0, undos=0) {
  const progress=state.kind==='pyramid'?state.pyramid.filter(c=>!c).length:state.foundations.reduce((n,p)=>n+p.length,0);
  return Math.max(0,progress*10+(state.won?500:0)-state.moves*2-hints*10-undos*5);
}
export function restore(initial, events) {
  if(!Array.isArray(events)||events.length>2000)throw Error('Invalid action history');
  let state=structuredClone(initial), history=[], hints=0, undos=0;
  for(const event of events){
    if(!event||state.won)throw Error('Invalid action');
    if(event.type==='hint'){hints++;continue;}
    if(event.type==='undo'){if(!history.length)throw Error('Nothing to undo');state=history.pop();undos++;continue;}
    const next=move(state,event);if(!next)throw Error('Illegal move');
    history=[...history.slice(-39),state];state=next;
  }
  return {state,history,metrics:{hints,undos}};
}
export function replay(initial,events){const {state,metrics}=restore(initial,events);return {score:points(state,metrics.hints,metrics.undos),moves:state.moves,won:state.won};}
