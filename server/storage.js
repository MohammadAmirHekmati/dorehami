import { createHash } from 'node:crypto';
const hash = token => createHash('sha256').update(token).digest('hex');
export async function openStorage() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, statement_timeout: 5000, application_name: 'dorehami' });
    pool.on('error', () => console.error('Database pool connection interrupted'));
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires);
      CREATE TABLE IF NOT EXISTS solo_runs (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,initial JSONB NOT NULL,score INTEGER,moves INTEGER,won BOOLEAN,created_at TIMESTAMPTZ NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS solo_runs_user_idx ON solo_runs(user_id,kind); CREATE TABLE IF NOT EXISTS game_rooms (code TEXT PRIMARY KEY, snapshot JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    await pool.query('CREATE TABLE IF NOT EXISTS solo_progress(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,revision TEXT NOT NULL,document JSONB NOT NULL,PRIMARY KEY(user_id,kind))');
    return {
      getProgress: async(user,kind)=>(await pool.query('SELECT revision,document FROM solo_progress WHERE user_id=$1 AND kind=$2',[user,kind])).rows[0],
      saveProgress: async(user,kind,expected,revision,document)=> expected===null
        ? (await pool.query('INSERT INTO solo_progress(user_id,kind,revision,document) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[user,kind,revision,JSON.stringify(document)])).rowCount===1
        : (await pool.query('UPDATE solo_progress SET revision=$4,document=$5 WHERE user_id=$1 AND kind=$2 AND revision=$3',[user,kind,expected,revision,JSON.stringify(document)])).rowCount===1,
      kind: 'postgres',
      createSoloRun: async(id,user,kind,initial)=>{await pool.query('INSERT INTO solo_runs(id,user_id,kind,initial) VALUES($1,$2,$3,$4)',[id,user,kind,JSON.stringify(initial)]);},
      getSoloRun: async(id,user)=>(await pool.query('SELECT * FROM solo_runs WHERE id=$1 AND user_id=$2',[id,user])).rows[0],
      finishSoloRun: async(id,user,r)=>{await pool.query('UPDATE solo_runs SET score=$3,moves=$4,won=$5 WHERE id=$1 AND user_id=$2 AND score IS NULL',[id,user,r.score,r.moves,r.won]);},
      soloRecords: async(user)=>(await pool.query('SELECT kind,MAX(score)::int AS best_score,COUNT(*)::int AS games,COUNT(*) FILTER (WHERE won)::int AS wins,MIN(moves) FILTER (WHERE won)::int AS best_moves FROM solo_runs WHERE user_id=$1 AND score IS NOT NULL GROUP BY kind',[user])).rows,
      findUser: async name => (await pool.query('SELECT * FROM users WHERE name=$1', [name])).rows[0],
      createUser: async u => { await pool.query('INSERT INTO users(id,name,password) VALUES($1,$2,$3)', [u.id,u.name,u.password]); },
      createSession: async (token,id,expires) => { await pool.query('INSERT INTO sessions VALUES($1,$2,$3)', [hash(token),id,expires]); },
      userFromToken: async token => (await pool.query('SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires>$2', [hash(token || ''),Date.now()])).rows[0],
      loadRooms: async () => (await pool.query('SELECT snapshot FROM game_rooms')).rows.map(r => r.snapshot),
      saveRoom: async room => { await pool.query('INSERT INTO game_rooms(code,snapshot) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET snapshot=$2,updated_at=now()', [room.code,JSON.stringify(room)]); },
      deleteRoom: async code => { await pool.query('DELETE FROM game_rooms WHERE code=$1', [code]); },
      clean: async () => { await pool.query('DELETE FROM sessions WHERE expires<$1', [Date.now()]); },
      ping: async () => { await pool.query('SELECT 1'); },
      close: () => pool.end()
    };
  }
  if (process.env.NODE_ENV === 'production') throw Error('DATABASE_URL is required in production');
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdirSync } = await import('node:fs');
  mkdirSync('data', { recursive: true });
  const db = new DatabaseSync('data/club.sqlite');
  db.exec('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE,password TEXT); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS game_rooms(code TEXT PRIMARY KEY,snapshot TEXT); CREATE TABLE IF NOT EXISTS solo_runs(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT,initial TEXT,score INTEGER,moves INTEGER,won INTEGER)');
  db.exec('CREATE TABLE IF NOT EXISTS solo_progress(user_id TEXT NOT NULL,kind TEXT NOT NULL,revision TEXT NOT NULL,document TEXT NOT NULL,PRIMARY KEY(user_id,kind))');
  return {
    getProgress: async(user,kind)=>{const row=db.prepare('SELECT revision,document FROM solo_progress WHERE user_id=? AND kind=?').get(user,kind);return row?{...row,document:JSON.parse(row.document)}:undefined;},
    saveProgress: async(user,kind,expected,revision,document)=>expected===null
      ? db.prepare('INSERT OR IGNORE INTO solo_progress VALUES(?,?,?,?)').run(user,kind,revision,JSON.stringify(document)).changes===1
      : db.prepare('UPDATE solo_progress SET revision=?,document=? WHERE user_id=? AND kind=? AND revision=?').run(revision,JSON.stringify(document),user,kind,expected).changes===1,
    kind: 'sqlite-local',
    createSoloRun: async(id,user,kind,initial)=>{db.prepare('INSERT INTO solo_runs(id,user_id,kind,initial) VALUES(?,?,?,?)').run(id,user,kind,JSON.stringify(initial));},
    getSoloRun: async(id,user)=>db.prepare('SELECT * FROM solo_runs WHERE id=? AND user_id=?').get(id,user),
    finishSoloRun: async(id,user,r)=>{db.prepare('UPDATE solo_runs SET score=?,moves=?,won=? WHERE id=? AND user_id=? AND score IS NULL').run(r.score,r.moves,r.won?1:0,id,user);},
    soloRecords: async(user)=>db.prepare('SELECT kind,MAX(score) AS best_score,COUNT(*) AS games,SUM(won) AS wins,MIN(CASE WHEN won=1 THEN moves END) AS best_moves FROM solo_runs WHERE user_id=? AND score IS NOT NULL GROUP BY kind').all(user),
    findUser: async name => db.prepare('SELECT * FROM users WHERE name=?').get(name),
    createUser: async u => { db.prepare('INSERT INTO users VALUES(?,?,?)').run(u.id,u.name,u.password); },
    createSession: async (token,id,expires) => { db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),id,expires); },
    userFromToken: async token => db.prepare('SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.userId WHERE s.token=? AND s.expires>?').get(hash(token || ''),Date.now()),
    loadRooms: async () => db.prepare('SELECT snapshot FROM game_rooms').all().map(r => JSON.parse(r.snapshot)),
    saveRoom: async room => { db.prepare('INSERT OR REPLACE INTO game_rooms VALUES(?,?)').run(room.code,JSON.stringify(room)); },
    deleteRoom: async code => { db.prepare('DELETE FROM game_rooms WHERE code=?').run(code); },
    clean: async () => { db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()); },
    ping: async () => { db.prepare('SELECT 1').get(); },
    close: async () => db.close()
  };
}
