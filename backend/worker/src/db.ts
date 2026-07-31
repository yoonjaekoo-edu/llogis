import { Pool } from 'pg';
import type { Env } from './env';

// Cloudflare Workers 에서 PostgreSQL 접속은 Hyperdrive 를 통해 한다.
// HYPERDRIVE.connectionString 은 Cloudflare 네트워크를 경유한 캐시된 TCP 경로를 제공한다.
// wrangler.toml 의 compatibility_flags 에 nodejs_compat 가 필요하다.
//
// 참고: pg (node-postgres) 는 Hyperdrive 와 함께 Workers 에서 동작한다.
// Hyperdrive 가 없으면 DATABASE_URL 폴백으로 직접 연결을 시도할 수 있다.
const pools = new WeakMap<HyperdriveLike, Pool>();

interface HyperdriveLike {
  connectionString: string;
}

function buildPool(hyperdrive: HyperdriveLike): Pool {
  return new Pool({
    connectionString: hyperdrive.connectionString,
    max: 5,
  });
}

export function getPool(env: Env): Pool {
  const hd = env.HYPERDRIVE;
  if (!hd?.connectionString) {
    throw new Error('HYPERDRIVE binding is not configured');
  }
  let pool = pools.get(hd);
  if (!pool) {
    pool = buildPool(hd);
    pools.set(hd, pool);
  }
  return pool;
}
