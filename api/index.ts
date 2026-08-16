import type { IncomingMessage, ServerResponse } from 'http';

let appModule: any = null;

async function getApp() {
  if (!appModule) {
    appModule = await import('../backend/src/index.js');
  }
  return appModule;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { app, ensureSchema } = await getApp();

    // Vercel 인스턴스마다 스키마를 한 번만 실행하고 동시 cold start는 같은 Promise를 기다린다.
    const runtimeState = globalThis as typeof globalThis & {
      __schemaReady?: boolean;
      __schemaReadyPromise?: Promise<void>;
    };
    if (!runtimeState.__schemaReady) {
      runtimeState.__schemaReadyPromise ??= ensureSchema().catch((error) => {
        runtimeState.__schemaReadyPromise = undefined;
        throw error;
      });
      await runtimeState.__schemaReadyPromise;
      runtimeState.__schemaReady = true;
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
