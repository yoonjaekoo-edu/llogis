import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type StoredUser = {
  username?: string;
  rating?: number;
  tokens?: number;
};

const DOGE_PATH = '/doge-market';
const RP_COST = 20000;

function readStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function DogeMarketPage() {
  const [user, setUser] = useState<StoredUser | null>(() => readStoredUser());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const canExchange = useMemo(
    () => Boolean(user && Number(user.rating || 0) >= RP_COST && !busy),
    [user, busy],
  );

  const exchange = async () => {
    if (!user || busy) return;
    if (Number(user.rating || 0) < RP_COST) {
      setMessage('RP가 부족해. 20,000 RP가 필요해.');
      return;
    }

    if (!window.confirm('20,000 RP를 DOGE 1개로 교환할까?')) return;

    const token = localStorage.getItem('token');
    if (!token) {
      setMessage('로그인이 필요해.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const res = await fetch('/api/store/exchange-rp-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || '교환에 실패했어.');
        return;
      }

      const nextUser = {
        ...user,
        rating: Number(data.rating) || 0,
        tokens: Number(data.tokens) || 0,
      };
      localStorage.setItem('user', JSON.stringify(nextUser));
      setUser(nextUser);
      setMessage('교환 완료! DOGE 1개가 추가됐어.');
    } catch {
      setMessage('네트워크 오류로 교환에 실패했어.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container" style={{ padding: '4rem 0', maxWidth: '900px', margin: '0 auto' }}>
      <section className="problem-card" style={{ padding: '2rem', margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.9rem', opacity: 0.65, fontWeight: 800 }}>LOGIS INTERNAL MARKET</div>
            <h2 style={{ margin: '0.25rem 0 0.5rem', color: 'var(--color-4)', fontSize: '2.4rem' }}>🐕 도지 마켓</h2>
            <p style={{ margin: 0, opacity: 0.72 }}>Logis 안에서 RP를 DOGE(토큰)로 교환하는 마켓이야.</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 900, fontSize: '1.15rem' }}>🐕 {Number(user?.tokens || 0).toLocaleString()} DOGE</div>
            <div style={{ opacity: 0.72, marginTop: '0.25rem' }}>✨ {Math.round(Number(user?.rating || 0)).toLocaleString()} RP</div>
          </div>
        </div>

        {!user && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.75rem' }}>
            로그인하면 도지 마켓을 사용할 수 있어.
          </div>
        )}

        {user && (
          <div style={{ marginTop: '2rem', display: 'grid', gap: '1rem' }}>
            <div style={{ padding: '1.4rem', border: '1px solid var(--border)', borderRadius: '1rem', background: 'var(--bg-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.35rem' }}>RP → DOGE</h3>
                  <p style={{ margin: 0, opacity: 0.7 }}>고정 환율: 20,000 RP = DOGE 1개</p>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={exchange}
                  disabled={!canExchange}
                  style={{
                    width: 'auto',
                    minWidth: '150px',
                    padding: '0.75rem 1.25rem',
                    background: canExchange ? 'var(--color-4)' : 'var(--border)',
                    color: canExchange ? 'white' : 'var(--text-muted)',
                    cursor: canExchange ? 'pointer' : 'not-allowed',
                    opacity: canExchange ? 1 : 0.65,
                  }}
                >
                  {busy ? '교환 중...' : '20,000 RP로 교환'}
                </button>
              </div>
            </div>

            {message && (
              <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.75rem', fontWeight: 800, textAlign: 'center' }}>
                {message}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export default function DogeMarketNav() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    window.addEventListener('popstate', updatePath);

    const install = () => {
      const nav = document.querySelector('header nav ul');
      const target = document.getElementById('main-content');
      if (target) setPortalTarget(target);
      if (!nav || nav.querySelector('[data-doge-market-nav]')) return;

      const item = document.createElement('li');
      item.setAttribute('data-doge-market-nav', 'true');

      const link = document.createElement('a');
      link.href = DOGE_PATH;
      link.textContent = '도지 마켓';
      link.setAttribute('aria-label', '도지 마켓 열기');
      link.addEventListener('click', (event) => {
        event.preventDefault();
        window.history.pushState({}, '', DOGE_PATH);
        updatePath();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      item.appendChild(link);

      const shopLink = Array.from(nav.querySelectorAll('a')).find(
        (a) => a.getAttribute('href') === '/shop',
      );
      const shopItem = shopLink?.closest('li');

      if (shopItem?.nextSibling) nav.insertBefore(item, shopItem.nextSibling);
      else nav.appendChild(item);
    };

    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', updatePath);
    };
  }, []);

  if (path !== DOGE_PATH || !portalTarget) return null;
  return createPortal(<DogeMarketPage />, portalTarget);
}
