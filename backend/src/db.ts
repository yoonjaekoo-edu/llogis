import { Pool } from 'pg';

let pool: Pool | null = null;

const COMMON_CONFIG = {
  max: 10,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  allowExitOnIdle: true,
};

export function getPool(): Pool {
  if (!pool) {
    if (process.env.DATABASE_URL) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        ...COMMON_CONFIG,
      });
    } else {
      pool = new Pool({
        user: process.env.DB_USER || 'mathuser',
        host: process.env.DB_HOST || 'db',
        database: process.env.DB_NAME || 'math_solved',
        password: process.env.DB_PASSWORD || 'mathpass',
        port: parseInt(process.env.DB_PORT || '5432'),
        ...COMMON_CONFIG,
      });
    }
  }
  return pool;
}

export default getPool;
