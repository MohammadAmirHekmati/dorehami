import {randomBytes} from 'node:crypto';
import {createGame} from '../shared/solo-engine.js';
import {replay} from '../shared/solo-score.js';
export function installSolo(app,storage){
  const limits=new Map();
  setInterval(()=>limits.clear(),60000).unref();
  app.use('/api/solo',async(req,res,next)=>{
    try{const user=await storage.userFromToken(req.headers.authorization?.replace('Bearer ',''));if(!user)return res.status(401).json({error:'برای ثبت رکورد وارد حساب شوید'});
      const count=(limits.get(user.id)||0)+1;limits.set(user.id,count);if(count>40)return res.status(429).json({error:'کمی صبر کنید'});req.user=user;next();
    }catch{res.status(503).json({error:'ارتباط با دیتابیس برقرار نشد'});}
  });
  app.get('/api/solo/records',async(req,res)=>{try{res.json({records:await storage.soloRecords(req.user.id)});}catch{res.status(503).json({error:'دریافت رکوردها ممکن نشد'});}});
  app.post('/api/solo/runs',async(req,res)=>{try{
    if(!['solitaire','pyramid'].includes(req.body.kind))return res.status(400).json({error:'بازی نامعتبر است'});
    const id=randomBytes(16).toString('hex'),initial=createGame(req.body.kind);
    await storage.createSoloRun(id,req.user.id,req.body.kind,initial);
    res.json({id,initial,userId:req.user.id});
  }catch{res.status(503).json({error:'شروع دست رکوردی ممکن نشد'});}});
  app.post('/api/solo/runs/:id/finish',async(req,res)=>{
    try{const run=await storage.getSoloRun(req.params.id,req.user.id);if(!run)return res.status(404).json({error:'دست بازی پیدا نشد'});
      if(run.score===null){let result;try{result=replay(typeof run.initial==='string'?JSON.parse(run.initial):run.initial,req.body.events);}catch{return res.status(400).json({error:'تاریخچهٔ حرکت‌ها معتبر نیست'});}
        await storage.finishSoloRun(run.id,req.user.id,result);
      }
      const saved=await storage.getSoloRun(run.id,req.user.id);
      res.json({result:{score:saved.score,moves:saved.moves,won:!!saved.won},records:await storage.soloRecords(req.user.id)});
    }catch{res.status(503).json({error:'ثبت نتیجه ممکن نشد؛ دوباره تلاش کنید'});}
  });
}
