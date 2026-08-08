import type { IncomingMessage, ServerResponse } from 'http';

// Static import so Vercel's nft (node file tracer) can resolve the dependency
import { app, ensureSchema } from '../backend/dist/index.js';

let schemaReady = false;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!schemaReady) {
      try {
        await ensureSchema();
        schemaReady = true;
      } catch (schemaErr: any) {
        console.error('Schema init failed:', schemaErr?.message || schemaErr);
        if (!res.headersSent) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Database connection failed', detail: schemaErr?.message }));
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
