import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    if (process.env.DATABASE_URL) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 5,
      });
    } else {
      pool = new Pool({
        user: process.env.DB_USER || 'mathuser',
        host: process.env.DB_HOST || 'db',
        database: process.env.DB_NAME || 'math_solved',
        password: process.env.DB_PASSWORD || 'mathpass',
        port: parseInt(process.env.DB_PORT || '5432'),
        max: 10,
      });
    }
  }
  return pool;
}

export default getPool;
