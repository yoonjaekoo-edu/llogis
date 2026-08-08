// Cloudflare Turnstile 서버사이드 검증 (Canonical siteverify)
// 환경변수: TURNSTILE_SECRET

export async function verifyTurnstile(token: string, ip: string): Promise<{ success: boolean; error?: string }> {
  if (!token) return { success: false, error: '캡차 인증이 필요합니다.' };

  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    console.warn('TURNSTILE_SECRET가 설정되지 않아 캡차 검증을 건너뜁니다.');
    return { success: true };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: ip,
    });

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) throw new Error(`siteverify ${res.status}`);

    const result: any = await res.json();

    if (!result.success) {
      const codes = (result['error-codes'] || []) as string[];
      return { success: false, error: codes.join(', ') || '캡차 검증 실패' };
    }

    return { success: true };
  } catch (err) {
    console.error('Turnstile 검증 오류:', err);
    return { success: false, error: '캡차 검증 요청 실패' };
  }
}
