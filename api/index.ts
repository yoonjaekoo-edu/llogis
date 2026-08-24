import type { IncomingMessage, ServerResponse } from 'http';

// 스키마 마이그레이션은 Vercel 빌드 단계에서 실행한다.
// 런타임 요청은 애플리케이션 처리만 수행해 콜드 스타트 지연을 줄인다.
import { app } from '../backend/dist/index.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
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
