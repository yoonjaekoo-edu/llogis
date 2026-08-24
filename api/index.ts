import type { IncomingMessage, ServerResponse } from 'http';

// Vercel의 파일 추적기가 백엔드 의존성을 확실히 포함하도록 정적 import 사용
import { app, ensureSchema } from '../backend/dist/index.js';
import { getPool } from '../backend/dist/db.js';

let schemaReady = false;
const pool = getPool();
const SCHEMA_LOCK_NAME = 'llogis:ensure-schema';

async function ensureSchemaOncePerDeployment() {
  if (schemaReady) return;

  const client = await pool.connect();
  const schemaVersion =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_URL ||
    'unknown-deployment';

  try {
    // 여러 서버리스 인스턴스가 동시에 시작돼도 스키마 변경은 하나씩만 실행한다.
    await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [SCHEMA_LOCK_NAME]);

    // 락을 기다리는 동안 같은 인스턴스의 다른 요청이 초기화를 끝냈을 수 있다.
    if (schemaReady) return;

    await client.query(`
      CREATE TABLE IF NOT EXISTS llogis_schema_init_runs (
        version TEXT PRIMARY KEY,
        initialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const alreadyInitialized = await client.query(
      'SELECT 1 FROM llogis_schema_init_runs WHERE version = $1',
      [schemaVersion]
    );

    if ((alreadyInitialized.rowCount ?? 0) === 0) {
      await ensureSchema();
      await client.query(
        `INSERT INTO llogis_schema_init_runs (version)
         VALUES ($1)
         ON CONFLICT (version) DO NOTHING`,
        [schemaVersion]
      );
    }

    schemaReady = true;
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [SCHEMA_LOCK_NAME]);
    } finally {
      client.release();
    }
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!schemaReady) {
      try {
        await ensureSchemaOncePerDeployment();
      } catch (schemaErr: any) {
        console.error('Schema init failed:', schemaErr?.message || schemaErr);
        if (!res.headersSent) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Database schema initialization failed',
              detail: schemaErr?.message,
            })
          );
        }
        return;
      }
    }

    return (app as any)(req, res);
  } catch (err: any) {
    console.error('Vercel handler error:', err?.message || err, err?.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', detail: err?.message }));
    }
  }
}

export const config = {
  maxDuration: 30,
};
