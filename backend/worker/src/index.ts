import type { Env } from './env';
import {
  getAllTemplates,
  getTemplateById,
  getUnits,
  getConcepts,
  generateProblemById,
  generateRandomProblem,
  generateProblems,
  batchGenerate,
} from './templates';
import { getUpload, keyFromUploadUrl } from './uploads';

// Cloudflare Workers 백엔드 이관 진입점.
// 기존 Express 앱(backend/src/index.ts)의 라우트를 하나씩 이 포인트로 옮기는 것이 목표.
// 아직 이관되지 않은 경로는 501 을 반환한다.

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function handleUploads(request: Request, env: Env, url: URL): Promise<Response> {
  const key = keyFromUploadUrl(url.pathname);
  if (!key) return json({ error: 'Not found' }, 404);
  const object = await getUpload(env, key);
  if (!object) return json({ error: 'Not found' }, 404);
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'public, immutable, max-age=2592000');
  return new Response(object.body, { headers });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  if (url.pathname === '/health') {
    return json({ ok: true, service: 'llogis-api', runtime: 'cloudflare-workers' });
  }

  if (url.pathname.startsWith('/uploads/')) {
    return handleUploads(request, env, url);
  }

  if (url.pathname === '/api/problems/templates' && method === 'GET') {
    return json(getAllTemplates().map(({ id, title, difficulty, unit, concepts }) => ({
      id,
      title,
      difficulty,
      unit,
      concepts,
    })));
  }

  if (url.pathname === '/api/problems/templates/units' && method === 'GET') {
    return json(getUnits());
  }

  if (url.pathname === '/api/problems/templates/concepts' && method === 'GET') {
    return json(getConcepts());
  }

  if (url.pathname.match(/^\/api\/problems\/templates\/[^/]+$/) && method === 'GET') {
    const id = decodeURIComponent(url.pathname.split('/').pop() || '');
    const template = getTemplateById(id);
    if (!template) return json({ error: 'Template not found' }, 404);
    return json(template);
  }

  if (url.pathname === '/api/problems/generate' && method === 'POST') {
    return json(generateRandomProblem());
  }

  if (url.pathname === '/api/problems/templates/generate' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as {
      templateId?: string;
      unit?: string;
      concept?: string;
      count?: number;
    };
    try {
      if (body.templateId) {
        const problem = generateProblemById(body.templateId);
        if (!problem) return json({ error: 'Template not found' }, 404);
        return json(problem);
      }
      if (body.count && body.count > 100) return json({ error: 'Max 100 problems per request' }, 400);
      return json(generateProblems({ unit: body.unit, concept: body.concept, count: body.count }));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Generation failed' }, 400);
    }
  }

  if (url.pathname === '/api/problems/templates/batch' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { templateId?: string; count?: number };
    const template = getTemplateById(body.templateId || '');
    if (!template) return json({ error: 'Template not found' }, 404);
    const count = Math.min(body.count || 10, 100);
    return json(batchGenerate(template, count));
  }

  return json(
    { error: 'Not migrated yet', hint: '이 경로는 아직 Cloudflare Workers 로 이관되지 않았습니다. backend/worker/src/index.ts 에 추가하세요.' },
    501,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
      return await route(request, env);
    } catch (err) {
      console.error('worker error:', err);
      return json({ error: 'Internal Server Error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
