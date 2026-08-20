import React, { useCallback, useEffect, useMemo, useState } from 'react';
type StoredUser = {
  username?: string;
  rating?: number;
  tokens?: number;
  [key: string]: unknown;
};

type PricePoint = { price: number; createdAt: string };
type Trade = {
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  gross: number;
  fee: number;
  net: number;
  created_at: string;
};

type MarketData = {
  price: number;
  previousPrice: number;
  changePercent: number;
  feeRate: number;
  balance: { rating: number; doge: number };
  history: PricePoint[];
  trades: Trade[];
};

const DOGE_PATH = '/doge-market';
const FEE_RATE = 0.025;

function readStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const formatRp = (value: number) => `${Math.round(value).toLocaleString()} RP`;
const formatPrice = (value: number) => Math.round(value).toLocaleString();

function Sparkline({ history }: { history: PricePoint[] }) {
  const points = useMemo(() => {
    if (history.length < 2) return '';
    const values = history.map((p) => Number(p.price) || 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    return values.map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 36 - ((value - min) / range) * 32;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }, [history]);

  if (!points) {
    return (
      <div style={{ height: '220px', display: 'grid', placeItems: 'center', opacity: 0.6 }}>
        시세 데이터가 쌓이는 중이야.
      </div>
    );
  }

  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="DOGE 최근 시세 그래프" style={{ width: '100%', height: '220px', overflow: 'visible' }}>
      <line x1="0" y1="10" x2="100" y2="10" stroke="var(--border)" strokeWidth="0.35" />
      <line x1="0" y1="20" x2="100" y2="20" stroke="var(--border)" strokeWidth="0.35" />
      <line x1="0" y1="30" x2="100" y2="30" stroke="var(--border)" strokeWidth="0.35" />
      <polyline points={points} fill="none" stroke="var(--color-4)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DogeMarketPage() {
  const [user, setUser] = useState<StoredUser | null>(() => readStoredUser());
  const [market, setMarket] = useState<MarketData | null>(null);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchMarket = useCallback(async (silent = false) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/doge-market', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '마켓 정보를 불러오지 못했어.');
      setMarket(data);

      const current = readStoredUser();
      if (current) {
        const next = { ...current, rating: data.balance.rating, tokens: data.balance.doge };
        localStorage.setItem('user', JSON.stringify(next));
        setUser(next);
      }
    } catch (err) {
      if (!silent) setMessage(err instanceof Error ? err.message : '마켓 정보를 불러오지 못했어.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarket();
    const timer = window.setInterval(() => fetchMarket(true), 5000);
    return () => window.clearInterval(timer);
  }, [fetchMarket]);

  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const price = Number(market?.price || 0);
  const gross = price * qty;
  const fee = gross * FEE_RATE;
  const total = side === 'buy' ? gross + fee : gross - fee;
  const maxBuy = price > 0 && market ? Math.max(0, Math.floor(market.balance.rating / (price * (1 + FEE_RATE)))) : 0;
  const maxSell = Math.max(0, Math.floor(market?.balance.doge || 0));
  const canSubmit = Boolean(market && qty >= 1 && !busy && (side === 'buy' ? qty <= maxBuy : qty <= maxSell));

  const setMax = () => setQuantity(String(side === 'buy' ? maxBuy : maxSell));

  const submitOrder = async () => {
    if (!canSubmit || !market) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const action = side === 'buy' ? '매수' : '매도';
    if (!window.confirm(`DOGE ${qty.toLocaleString()}개를 ${action}할까?\n수수료: ${formatRp(fee)}`)) return;

    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/doge-market/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ side, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '주문에 실패했어.');
        return;
      }

      const current = readStoredUser() || user || {};
      const next = { ...current, rating: Number(data.rating) || 0, tokens: Number(data.doge) || 0 };
      localStorage.setItem('user', JSON.stringify(next));
      setUser(next);
      const navRp = document.querySelector('.nav-rp');
      if (navRp) navRp.textContent = `✨ ${Math.round(Number(data.rating) || 0).toLocaleString()} RP`;
      setMessage(`✅ ${data.message} 체결가 ${formatRp(Number(data.price))} · 수수료 ${formatRp(Number(data.fee))}`);
      await fetchMarket(true);
    } catch {
      setMessage('네트워크 오류로 주문에 실패했어.');
    } finally {
      setBusy(false);
    }
  };

  const change = Number(market?.changePercent || 0);
  const portfolioValue = (market?.balance.doge || 0) * price;

  return (
    <main className="container" style={{ padding: '3rem 0', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <section className="problem-card" style={{ padding: '1.5rem', margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.62, fontWeight: 800 }}>LOGIS VIRTUAL MARKET · 실제 암호화폐 아님</div>
              <h2 style={{ margin: '0.3rem 0 0.35rem', color: 'var(--color-4)', fontSize: '2.3rem' }}>🐕 DOGE / RP</h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.65rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '2rem' }}>{loading && !market ? '—' : `${formatPrice(price)} RP`}</strong>
                <span style={{ fontWeight: 800, color: change >= 0 ? '#2e9b62' : '#d84a4a' }}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                </span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: '0.65rem' }}>
              <div style={{ padding: '0.8rem 1rem', border: '1px solid var(--border)', borderRadius: '0.8rem' }}>
                <div style={{ fontSize: '0.78rem', opacity: 0.65 }}>보유 RP</div>
                <b>{formatRp(market?.balance.rating || Number(user?.rating || 0))}</b>
              </div>
              <div style={{ padding: '0.8rem 1rem', border: '1px solid var(--border)', borderRadius: '0.8rem' }}>
                <div style={{ fontSize: '0.78rem', opacity: 0.65 }}>보유 DOGE</div>
                <b>{Math.floor(market?.balance.doge || Number(user?.tokens || 0)).toLocaleString()} DOGE</b>
              </div>
            </div>
          </div>
        </section>

        {!user ? (
          <section className="problem-card" style={{ margin: 0, padding: '1.5rem' }}>로그인하면 도지 마켓을 사용할 수 있어.</section>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.65fr) minmax(280px, 0.85fr)', gap: '1rem' }}>
            <section className="problem-card" style={{ padding: '1.25rem', margin: 0, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0 }}>시세</h3>
                  <div style={{ fontSize: '0.82rem', opacity: 0.65, marginTop: '0.2rem' }}>15초 단위 변동 · 거래량에 따른 미세한 가격 영향</div>
                </div>
                <button type="button" className="btn" onClick={() => fetchMarket()} style={{ width: 'auto', padding: '0.45rem 0.8rem' }}>새로고침</button>
              </div>
              <Sparkline history={market?.history || []} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginTop: '0.8rem' }}>
                <div style={{ padding: '0.7rem', borderTop: '1px solid var(--border)' }}><small style={{ opacity: 0.6 }}>현재가</small><div style={{ fontWeight: 800 }}>{formatRp(price)}</div></div>
                <div style={{ padding: '0.7rem', borderTop: '1px solid var(--border)' }}><small style={{ opacity: 0.6 }}>평가액</small><div style={{ fontWeight: 800 }}>{formatRp(portfolioValue)}</div></div>
                <div style={{ padding: '0.7rem', borderTop: '1px solid var(--border)' }}><small style={{ opacity: 0.6 }}>수수료</small><div style={{ fontWeight: 800 }}>2.5%</div></div>
              </div>
            </section>

            <section className="problem-card" style={{ padding: '1.25rem', margin: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                <button type="button" className="btn" onClick={() => setSide('buy')} style={{ background: side === 'buy' ? 'var(--color-4)' : 'var(--bg-color)', color: side === 'buy' ? 'white' : 'var(--text-main)' }}>매수</button>
                <button type="button" className="btn" onClick={() => setSide('sell')} style={{ background: side === 'sell' ? '#d84a4a' : 'var(--bg-color)', color: side === 'sell' ? 'white' : 'var(--text-main)' }}>매도</button>
              </div>

              <label style={{ display: 'block', fontWeight: 800, marginBottom: '0.4rem' }} htmlFor="doge-qty">수량</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input id="doge-qty" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '0.75rem', borderRadius: '0.65rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)' }} />
                <button type="button" className="btn" onClick={setMax} style={{ width: 'auto', padding: '0.6rem 0.85rem' }}>MAX</button>
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.65, marginTop: '0.35rem' }}>
                최대 {side === 'buy' ? maxBuy.toLocaleString() : maxSell.toLocaleString()} DOGE
              </div>

              <div style={{ display: 'grid', gap: '0.55rem', marginTop: '1.2rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>주문금액</span><b>{formatRp(gross)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>수수료 (2.5%)</span><b>{formatRp(fee)}</b></div>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                  <span>{side === 'buy' ? '총 결제' : '실수령'}</span><span>{formatRp(total)}</span>
                </div>
              </div>

              <button type="button" className="btn" disabled={!canSubmit} onClick={submitOrder} style={{ marginTop: '1rem', background: canSubmit ? (side === 'buy' ? 'var(--color-4)' : '#d84a4a') : 'var(--border)', color: canSubmit ? 'white' : 'var(--text-muted)', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
                {busy ? '주문 처리 중...' : `${qty.toLocaleString()} DOGE ${side === 'buy' ? '매수' : '매도'}`}
              </button>
            </section>
          </div>
        )}

        {message && (
          <div style={{ padding: '0.9rem 1rem', border: '1px solid var(--border)', borderRadius: '0.75rem', fontWeight: 800 }}>
            {message}
          </div>
        )}

        {user && (
          <section className="problem-card" style={{ padding: '1.25rem', margin: 0 }}>
            <h3 style={{ margin: '0 0 0.9rem' }}>최근 주문</h3>
            {(market?.trades || []).length === 0 ? (
              <div style={{ opacity: 0.65 }}>아직 체결 내역이 없어.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '650px' }}>
                  <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}><th style={{ padding: '0.6rem' }}>구분</th><th>수량</th><th>체결가</th><th>수수료</th><th>결제/수령</th><th>시간</th></tr></thead>
                  <tbody>{(market?.trades || []).map((trade, index) => (
                    <tr key={`${trade.created_at}-${index}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.65rem', fontWeight: 900, color: trade.side === 'buy' ? 'var(--color-4)' : '#d84a4a' }}>{trade.side === 'buy' ? '매수' : '매도'}</td>
                      <td>{trade.quantity.toLocaleString()}</td>
                      <td>{formatRp(trade.price)}</td>
                      <td>{formatRp(trade.fee)}</td>
                      <td>{formatRp(trade.net)}</td>
                      <td>{new Date(trade.created_at).toLocaleString('ko-KR')}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

export default function DogeMarketPage() {
  return <DogeMarketPage />;
}
