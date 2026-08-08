// 어뷰징 방지 유틸리티
// 다중계정 생성 방지, 일회용 이메일 차단, IP/fingerprint 추적

import { Pool } from 'pg';

// ─── 일회용 이메일 도메인 블랙리스트 ───
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'tempmail.com', 'throwaway.email', 'temp-mail.org', 'fakeinbox.com',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'dispostable.com',
  'yopmail.com', 'yopmail.fr', 'maildrop.cc', 'trashmail.com',
  'mailnesia.com', 'tempail.com', 'tempr.email', 'discard.email',
  'discardmail.com', 'disposableemailaddresses.emailmiser.com',
  'emailondeck.com', '33mail.com', 'mytemp.email', 'mohmal.com',
  'getnada.com', 'emailfake.com', 'temp-mail.io', 'fake.email',
  'crazymailing.com', 'freemail24.com', 'meltmail.com', 'nospam.ze.tc',
  'tempinbox.com', 'tempomail.fr', 'tmpmail.net', 'tmpmail.org',
  'jetable.org', 'jetable.com', 'jetable.fr.nf', 'jetable.net',
  'mailnull.com', 'spamavert.com', 'tempr.email', 'tmpmailer.com',
  '10minutemail.com', '10minutemail.co.za', 'burnermail.io',
  'harakirimail.com', 'tmail.ws', 'tmail.io', 'mailsac.com',
  'trashmailer.com', 'uggsrock.com', 'binkmail.com', 'bobmail.info',
  'chammy.info', 'devnullmail.com', 'letthemeatspam.com',
  'meinspamschutz.de', 'slopsbox.com', 'smashmail.de', 'spaml.com',
  'spammotel.com', 'spamobox.com', 'spamcero.com', 'spamcorptastic.com',
  'spamfree24.org', 'spamgourmet.com', 'spamherelots.com',
  'spamhereplease.com', 'spamhole.com', 'spamify.com',
  'spaminator.de', 'spamkill.info', 'spaml.de', 'spammotel.com',
  'spamobox.com', 'spamoff.de', 'spamslicer.com', 'spamspot.com',
  'spamstack.net', 'spamthis.co.uk', 'spamtrail.com',
  'superrito.com', 'touristinfo.info', 'wegwerfmail.de',
  'wegwerfmail.net', 'wegwerfmail.org',
]);

export function isDisposableEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

// ─── IP 서브넷 추출 ───
export function getIpSubnet(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }
  return ip; // IPv6 등 처리
}

// ─── 이메일 형식 검증 ───
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  // 기본 형식 검증 + 너무 긴 이메일 차단
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── 사용자 이름 검증 ───
export function isValidUsername(username: string): { ok: boolean; error?: string } {
  if (!username || typeof username !== 'string') {
    return { ok: false, error: '사용자 이름을 입력해주세요.' };
  }
  if(username === 'admin'){
    return { ok: false, error: '너의 모든 조상님을 걸고 admin은 안 됨'};
  }
  const trimmed = username.trim();
  if (trimmed.length < 2) {
    return { ok: false, error: '사용자 이름은 2자 이상이어야 합니다.' };
  }
  if (trimmed.length > 20) {
    return { ok: false, error: '사용자 이름은 20자 이내로 입력해주세요.' };
  }
  // 허용: 한글, 영문, 숫자, 언더스코어, 하이픈
  if (!/^[a-zA-Z0-9가-힣_-]+$/.test(trimmed)) {
    return { ok: false, error: '사용자 이름은 한글, 영문, 숫자, _, -만 사용할 수 있습니다.' };
  }
  return { ok: true };
}

// ─── 비밀번호 강도 검증 ───
export function validatePassword(password: string): { ok: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { ok: false, error: '비밀번호를 입력해주세요.' };
  }
  if (password.length < 8) {
    return { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' };
  }
  if (password.length > 100) {
    return { ok: false, error: '비밀번호가 너무 깁니다.' };
  }
  return { ok: true };
}

// ─── Bio 글자 수 제한 ───
export function validateBio(bio: string): { ok: boolean; error?: string; clean: string } {
  if (typeof bio !== 'string') {
    return { ok: true, clean: '' };
  }
  const trimmed = bio.trim();
  if (trimmed.length > 10) {
    return { ok: false, error: '자기소개는 10자 이내로 입력해주세요.', clean: trimmed.slice(0, 10) };
  }
  // HTML 태그 방지
  if (/<[^>]*>/.test(trimmed)) {
    return { ok: false, error: 'HTML 태그는 사용할 수 없습니다.', clean: trimmed.replace(/<[^>]*>/g, '') };
  }
  return { ok: true, clean: trimmed };
}

// ─── 브라우저 핑거프린트 생성 (서버사이드, 간이) ───
export function generateServerFingerprint(userAgent: string, acceptLanguage: string): string {
  const raw = `${userAgent || ''}|${acceptLanguage || ''}`;
  // 간단한 해시 (crypto 사용하지 않고 수동 구현)
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

// ─── 어뷰징 체크 (DB 쿼리) ───
export async function checkAbuse(
  pool: Pool,
  params: {
    fingerprint: string;
    ipSubnet: string;
    email: string;
  }
): Promise<{ blocked: boolean; reason?: string }> {
  const { fingerprint, ipSubnet, email } = params;

  // 1. 동일 이메일 중복 체크
  const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (emailCheck.rows.length > 0) {
    return { blocked: true, reason: '이미 가입된 이메일입니다.' };
  }

  // 2. 동일 기기(fingerprint) 최근 24시간 내 가입 수 체크
  const fpResult = await pool.query(
    `SELECT COUNT(*) as count FROM signup_fingerprints
     WHERE visitor_id = $1
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [fingerprint]
  );
  const fpCount = parseInt(fpResult.rows[0].count, 10);
  if (fpCount >= 1) {
    return { blocked: true, reason: '동일 기기에서는 하루에 1개의 계정만 만들 수 있습니다.' };
  }

  // 3. 동일 IP 서브넷 최근 24시간 내 가입 수 체크
  const ipResult = await pool.query(
    `SELECT COUNT(*) as count FROM signup_fingerprints
     WHERE ip_subnet = $1
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [ipSubnet]
  );
  const ipCount = parseInt(ipResult.rows[0].count, 10);
  if (ipCount >= 1) {
    return { blocked: true, reason: '해당 네트워크에서는 하루에 1개의 계정만 만들 수 있습니다.' };
  }

  return { blocked: false };
}

// ─── 핑거프린트 기록 ───
export async function recordFingerprint(
  pool: Pool,
  params: {
    visitorId: string;
    ipSubnet: string;
    userAgent: string;
    userId: number;
  }
): Promise<void> {
  const { visitorId, ipSubnet, userAgent, userId } = params;
  await pool.query(
    `INSERT INTO signup_fingerprints (visitor_id, ip_subnet, user_agent, user_id)
     VALUES ($1, $2, $3, $4)`,
    [visitorId, ipSubnet, userAgent, userId]
  );
}
