import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    // DATABASE_URL이나 Neon의 NEON_POSTGRES_URL_NON_POOLING 사용
    const databaseUrl = process.env.DATABASE_URL || process.env.NEON_POSTGRES_URL_NON_POOLING;
    
    if (databaseUrl) {
      pool = new Pool({
        connectionString: databaseUrl,
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
