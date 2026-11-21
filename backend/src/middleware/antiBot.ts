import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const ANTI_BOT_SECRET =
  process.env.ANTI_BOT_SECRET || process.env.JWT_SECRET || 'llogis-anti-bot-fallback-secret';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5분

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const usedNonces = new Map<string, number>();

function cleanupExpiredNonces(now: number) {
  for (const [nonce, exp] of usedNonces.entries()) {
    if (exp <= now) {
      usedNonces.delete(nonce);
    }
  }
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const store = new Map<string, RateLimitEntry>();
  const { windowMs, max, message = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (store.size > 5000) {
      for (const [key, entry] of store.entries()) {
        if (entry.resetAt <= now) store.delete(key);
      }
    }

    const ip = getClientIp(req);
    const entry = store.get(ip);

    if (!entry || entry.resetAt <= now) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}

export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: '인증 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
});

const SUBMISSION_COOLDOWN_MS = 2000; // 최소 2초 간격
const SUBMISSION_WINDOW_MS = 60 * 1000; // 1분
const SUBMISSION_MAX_PER_WINDOW = 15; // 1분당 최대 15회

const submissionTracker = new Map<
  string,
  { lastSubmitAt: number; count: number; resetAt: number; flagged: boolean }
>();

function getSubmissionKey(req: any): string {
  return req.user?.id ? `user:${req.user.id}` : `ip:${getClientIp(req)}`;
}

export function submissionRateLimiter(req: any, res: Response, next: NextFunction) {
  const now = Date.now();
  if (submissionTracker.size > 5000) {
    for (const [key, entry] of submissionTracker.entries()) {
      if (!entry.flagged && entry.resetAt <= now && now - entry.lastSubmitAt > SUBMISSION_COOLDOWN_MS) {
        submissionTracker.delete(key);
      }
    }
  }

  const key = getSubmissionKey(req);
  const entry = submissionTracker.get(key);

  if (!entry) {
    submissionTracker.set(key, {
      lastSubmitAt: now,
      count: 1,
      resetAt: now + SUBMISSION_WINDOW_MS,
      flagged: false,
    });
    return next();
  }

  if (entry.flagged) {
    return res.status(403).json({
      error: '사람인지 확인이 필요합니다.',
      requireHumanVerification: true,
    });
  }

  if (now - entry.lastSubmitAt < SUBMISSION_COOLDOWN_MS) {
    entry.flagged = true;
    return res.status(403).json({
      error: '너무 빠르게 문제를 제출하여 사람인지 확인이 필요합니다.',
      requireHumanVerification: true,
    });
  }

  if (entry.resetAt <= now) {
    entry.count = 1;
    entry.resetAt = now + SUBMISSION_WINDOW_MS;
    entry.lastSubmitAt = now;
    return next();
  }

  entry.count += 1;
  entry.lastSubmitAt = now;
  if (entry.count > SUBMISSION_MAX_PER_WINDOW) {
    entry.flagged = true;
    return res.status(403).json({
      error: '짧은 시간에 너무 많은 문제를 제출하여 사람인지 확인이 필요합니다.',
      requireHumanVerification: true,
    });
  }

  return next();
}

export function clearHumanVerification(req: any, res: Response) {
  const key = getSubmissionKey(req);
  submissionTracker.delete(key);
  res.json({ verified: true });
}

interface ChallengePayload {
  nonce: string;
  answer: number;
  exp: number;
}

function signPayload(payload: ChallengePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', ANTI_BOT_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): ChallengePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', ANTI_BOT_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ChallengePayload;
  } catch {
    return null;
  }
}

export function issueChallenge(_req: Request, res: Response) {
  const opIndex = crypto.randomInt(0, 3);
  let a: number;
  let b: number;
  let question: string;
  let answer: number;

  if (opIndex === 0) {
    a = crypto.randomInt(3, 25);
    b = crypto.randomInt(3, 25);
    question = `${a} + ${b} = ?`;
    answer = a + b;
  } else if (opIndex === 1) {
    a = crypto.randomInt(10, 30);
    b = crypto.randomInt(1, a);
    question = `${a} - ${b} = ?`;
    answer = a - b;
  } else {
    a = crypto.randomInt(2, 10);
    b = crypto.randomInt(2, 10);
    question = `${a} × ${b} = ?`;
    answer = a * b;
  }

  const nonce = crypto.randomBytes(12).toString('hex');
  const exp = Date.now() + CHALLENGE_TTL_MS;
  const token = signPayload({ nonce, answer, exp });

  res.json({ question, token, expiresInMs: CHALLENGE_TTL_MS });
}

export function verifyAntiBot(req: Request, res: Response, next: NextFunction) {
  const { website, challengeToken, challengeAnswer } = req.body || {};

  // Honeypot 검사: 사람이 아닌 자동화 봇이 숨김 필드를 채운 경우 차단
  if (typeof website === 'string' && website.trim().length > 0) {
    return res.status(400).json({ error: '봇 활동이 감지되었습니다.' });
  }

  if (typeof challengeToken !== 'string' || challengeToken.length === 0) {
    return res.status(400).json({ error: '봇 방지 인증이 필요합니다.' });
  }

  const parsedAnswer = Number(String(challengeAnswer ?? '').trim());
  if (!Number.isFinite(parsedAnswer)) {
    return res.status(400).json({ error: '봇 방지 질문의 답을 숫자로 입력해주세요.' });
  }

  const payload = verifyToken(challengeToken);
  if (!payload) {
    return res.status(400).json({ error: '유효하지 않은 봇 방지 토큰입니다.' });
  }

  const now = Date.now();
  cleanupExpiredNonces(now);

  if (payload.exp < now) {
    return res.status(400).json({ error: '봇 방지 인증이 만료되었습니다. 새로고침 후 다시 시도해주세요.' });
  }

  if (usedNonces.has(payload.nonce)) {
    return res.status(400).json({ error: '이미 사용된 봇 방지 토큰입니다. 새로고침 후 다시 시도해주세요.' });
  }

  if (parsedAnswer !== payload.answer) {
    return res.status(400).json({ error: '봇 방지 질문의 답이 올바르지 않습니다.' });
  }

  usedNonces.set(payload.nonce, payload.exp);
  return next();
}
