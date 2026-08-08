// Rate Limiter 미들웨어
// express-rate-limit 없이 메모리 기반으로 구현
// (이미 설치된 패키지 의존성 없이 동작)

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

// 메모리 정리 (5분마다 오래된 항목 제거)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime <= now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitOptions {
  windowMs: number;   // 윈도우 밀리초
  max: number;         // 최대 요청 수
  message?: string;    // 차단 시 메시지
  keyGenerator?: (req: Request) => string; // 키 생성 함수
}

export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
    keyGenerator,
  } = options;

  const getKey = keyGenerator || ((req: Request) => {
    const xff = req.headers['x-forwarded-for'];
    const ip = typeof xff === 'string' && xff.length > 0
      ? xff.split(',')[0].trim()
      : (req.ip || req.socket.remoteAddress || 'unknown');
    return ip;
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const key = getKey(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetTime <= now) {
      store.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

// 회원가입용 rate limit (IP 기준 24시간에 1회)
export const signupRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24시간
  max: 1,
  message: '회원가입은 하루에 1회만 가능합니다.',
});

// 프로필 수정용 rate limit (IP 기준 10분에 10회)
export const profileRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10분
  max: 10,
  message: '프로필 수정 요청이 너무 많습니다.',
  keyGenerator: (req: Request) => {
    const xff = req.headers['x-forwarded-for'];
    const ip = typeof xff === 'string' && xff.length > 0
      ? xff.split(',')[0].trim()
      : (req.ip || req.socket.remoteAddress || 'unknown');
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    return `profile:${ip}:${token.slice(-8)}`;
  },
});

// 로그인 시도 rate limit (IP 기준 15분에 10회)
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 10,
  message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
});
