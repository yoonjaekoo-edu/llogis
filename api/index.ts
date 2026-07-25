import type { IncomingMessage, ServerResponse } from 'http';

let appModule: any = null;

async function getApp() {
  if (!appModule) {
    appModule = await import('../backend/src/index');
  }
  return appModule;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { app, ensureSchema } = await getApp();

    // Run schema on cold start
    if (!(globalThis as any).__schemaReady) {
      await ensureSchema();
      (globalThis as any).__schemaReady = true;
    }

    return app(req, res);
  } catch (err: any) {
    console.error('Vercel handler error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }
}

export const config = {
  maxDuration: 30,
};
