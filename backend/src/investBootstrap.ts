import type { Express } from 'express';
import type { Pool } from 'pg';
import { registerInvestRoutes } from './investRoutes';

export function initInvesting(app: Express, pool: Pool, jwtSecret: string) {
  registerInvestRoutes(app, pool, jwtSecret);
}
