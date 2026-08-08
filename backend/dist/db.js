"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
const pg_1 = require("pg");
let pool = null;
const COMMON_CONFIG = {
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: true,
};
function getPool() {
    if (!pool) {
        if (process.env.DATABASE_URL) {
            pool = new pg_1.Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false },
                ...COMMON_CONFIG,
            });
        }
        else {
            pool = new pg_1.Pool({
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
exports.default = getPool;
