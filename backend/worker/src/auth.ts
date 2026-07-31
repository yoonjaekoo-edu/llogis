import { SignJWT, jwtVerify } from 'jose';
import type { Env } from './env';

// 기존 jsonwebtoken (Node crypto 의존) 은 Workers 에서 동작하지 않으므로
// WebCrypto 기반의 jose 로 대체한다. 토큰 형식(HS256)과 payload 는 동일하게 유지한다.
// 기존 서버에서 발급한 토큰과 호환되도록 secret 을 동일하게 사용한다.

export interface JwtUser {
  id: number;
  username: string;
  email?: string;
  role?: string;
}

export function getSecretKey(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signToken(env: Env, user: JwtUser, expiresInSeconds = 86400): Promise<string> {
  return new SignJWT(user as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(getSecretKey(env));
}

export async function verifyToken(env: Env, token: string): Promise<JwtUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(env));
    return payload as unknown as JwtUser;
  } catch {
    return null;
  }
}

export function extractBearer(authorization: string | null): string | null {
  if (!authorization) return null;
  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}
