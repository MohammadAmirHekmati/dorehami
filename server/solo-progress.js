import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createGame} from '../shared/solo-engine.js';
import {restore,replay} from '../shared/solo-score.js';
const id=()=>randomBytes(16).toString('hex');
export function installProgress(app,storage){
  async function view(user,row){
    if(!row)return {progress:null};
    const doc=row.document,run=await storage.getSoloRun(doc.id,user);
    const initial=typeof run.initial==='string'?JSON.parse(run.initial):run.initial;
    const detail=restore(initial,doc.events);
    // Repair a final score if the connection was lost between the two durable writes.
    if(doc.result)await storage.finishSoloRun(doc.id,user,doc.result);
    return {progress:{...detail,initial,record:{id:doc.id,userId:user,events:doc.events,revision:row.revision,submitted:!!doc.result,...(doc.result?{result:doc.result}:{})}}};
  }
  app.get('/api/solo/progress/:kind',async(req,res)=>{
    if(!['solitaire','pyramid'].includes(req.params.kind))return res.status(400).json({error:'بازی نامعتبر است'});
    try{res.json(await view(req.user.id,await storage.getProgress(req.user.id,req.params.kind)));}catch{res.status(503).json({error:'دریافت بازی ذخیره‌شده ممکن نشد'});}
  });
  app.post('/api/solo/progress/:kind',async(req,res)=>{
    const user=req.user.id,kind=req.params.kind,{action,revision,events}=req.body;
    if(!['solitaire','pyramid'].includes(kind)||!['new','save','finish'].includes(action)||!(revision===null||typeof revision==='string'))return res.status(400).json({error:'درخواست نامعتبر است'});
    try{
      const current=await storage.getProgress(user,kind);
      const conflict=()=>res.status(409).json({error:'بازی روی دستگاه دیگری تغییر کرده؛ نسخهٔ حساب را دریافت کن.'});
      // An exact retry is safe even if the first acknowledgement was lost.
      if(current&&action!=='new'&&req.body.id===current.document.id&&isDeepStrictEqual(events,current.document.events)&&!!current.document.result===(action==='finish'))return res.json(await view(user,current));
      if((current?.revision??null)!==revision)return conflict();
      let document;
      if(action==='new'){
        if(current?.document.result)await storage.finishSoloRun(current.document.id,user,current.document.result);
        if(!current&&req.body.legacyId){
          const run=await storage.getSoloRun(req.body.legacyId,user);
          if(!run||run.kind!==kind||run.score!==null)return res.status(400).json({error:'دست قبلی قابل انتقال نیست'});
          try{replay(typeof run.initial==='string'?JSON.parse(run.initial):run.initial,events);}catch{return res.status(400).json({error:'تاریخچهٔ دست قبلی معتبر نیست'});}
          document={id:run.id,events};
        }else{const runId=id();await storage.createSoloRun(runId,user,kind,createGame(kind));document={id:runId,events:[]};}
      }else{
        if(!current||current.document.id!==req.body.id||current.document.result)return conflict();
        const run=await storage.getSoloRun(current.document.id,user);if(run.score!==null)return conflict();
        let result;try{result=replay(typeof run.initial==='string'?JSON.parse(run.initial):run.initial,events);}catch{return res.status(400).json({error:'تاریخچهٔ حرکت‌ها معتبر نیست'});}
        document={id:run.id,events,...(action==='finish'?{result}:{})};
      }
      const next={revision:id(),document};
      if(!await storage.saveProgress(user,kind,revision,next.revision,document))return conflict();
      res.json(await view(user,next));
    }catch{res.status(503).json({error:'ذخیره در حساب انجام نشد؛ دوباره تلاش کن.'});}
  });
}
