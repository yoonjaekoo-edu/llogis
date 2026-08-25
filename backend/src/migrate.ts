import { getPool } from './db';

async function runMigration() {
  // index.ts를 불러올 때 로컬 서버가 뜨지 않도록 Vercel 모드로 고정한다.
  process.env.VERCEL = '1';

  const { ensureSchema } = await import('./index.js');
  const pool = getPool();
  const client = await pool.connect();
  const lockName = 'llogis:ensure-schema';

  try {
    console.log('DB 스키마 초기화 시작');
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockName]);
    await ensureSchema();
    console.log('DB 스키마 초기화 완료');
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('DB 스키마 초기화 실패:', error);
    process.exit(1);
  });
