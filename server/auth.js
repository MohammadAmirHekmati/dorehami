import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export function installAuth(app, storage) {
  const attempts = new Map();
  let working = 0;
  const cleanup = setInterval(() => { for (const [key,a] of attempts) if (Date.now()-a.time>60000) attempts.delete(key); }, 60000);
  cleanup.unref();
  app.post('/api/auth', async (req,res) => {
    const key = req.ip;
    let a = attempts.get(key);
    if (!a || Date.now()-a.time>60000) { a={n:0,time:Date.now()}; attempts.set(key,a); }
    if (++a.n>20 || working>=4) return res.status(429).json({error:'کمی صبر کنید و دوباره امتحان کنید'});
    working++;
    try {
      const {name,password,mode}=req.body;
      if (typeof name!=='string'||name.trim().length<2||name.length>24||typeof password!=='string'||password.length<6||password.length>100||!['register','login'].includes(mode)) return res.status(400).json({error:'نام ۲ تا ۲۴ حرف و رمز حداقل ۶ حرف باشد'});
      let u=await storage.findUser(name.trim());
      if (mode==='register') {
        if(u) return res.status(400).json({error:'این نام قبلاً ثبت شده است'});
        const salt=randomBytes(16).toString('hex');
        u={id:randomBytes(12).toString('hex'),name:name.trim(),password:salt+':'+(await derive(password,salt,64)).toString('hex')};
        await storage.createUser(u);
      } else {
        const [salt,stored]=(u?.password || 'invalid:'+ '0'.repeat(128)).split(':');
        const result=await derive(password,salt,64);
        if(!u || !timingSafeEqual(Buffer.from(stored,'hex'),result)) return res.status(400).json({error:'نام یا رمز صحیح نیست'});
      }
      const token=randomBytes(32).toString('hex');
      await storage.createSession(token,u.id,Date.now()+30*86400000);
      res.json({token,user:{id:u.id,name:u.name}});
    } catch { res.status(503).json({error:'ذخیره‌سازی در دسترس نیست؛ دوباره تلاش کنید'}); }
    finally { working--; }
  });
  app.get('/api/me',async (req,res) => {
    try { const user=await storage.userFromToken(req.headers.authorization?.replace('Bearer ','')); res.status(user?200:401).json({user}); }
    catch { res.status(503).json({error:'ارتباط با پایگاه داده برقرار نشد'}); }
  });
}
