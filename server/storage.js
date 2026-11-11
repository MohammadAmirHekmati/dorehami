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
      CREATE TABLE IF NOT EXISTS game_rooms (code TEXT PRIMARY KEY, snapshot JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    return {
      kind: 'postgres',
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
  db.exec('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT UNIQUE,password TEXT); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS game_rooms(code TEXT PRIMARY KEY,snapshot TEXT)');
  return {
    kind: 'sqlite-local',
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
