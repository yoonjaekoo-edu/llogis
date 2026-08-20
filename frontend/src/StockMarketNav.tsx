import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type StoredUser = { username?: string; rating?: number; [key: string]: unknown };
type Quote = { symbol: string; name: string; price: number; previousClose: number; changePercent: number; updatedAt: string };
type Holding = { symbol: string; name: string; quantity: number; averagePrice: number; price: number; value: number; profit: number; profitPercent: number };
type Trade = { side: 'buy' | 'sell'; symbol: string; name: string; quantity: number; price: number; total: number; created_at: string };
type MarketData = { balance: { rating: number }; quotes: Quote[]; holdings: Holding[]; trades: Trade[] };

const MARKET_PATH = '/invest';
const formatRp = (value: number) => `${Math.round(value).toLocaleString()} RP`;

function readStoredUser(): StoredUser | null {
  try { const raw = localStorage.getItem('user'); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function StockMarketPage() {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [symbol, setSymbol] = useState('005930');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('1');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const fetchMarket = useCallback(async (silent = false) => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/invest', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '투자 정보를 불러오지 못했어.');
      setMarket(data);
      const current = readStoredUser();
      if (current) {
        const next = { ...current, rating: Number(data.balance.rating) || 0 };
        localStorage.setItem('user', JSON.stringify(next));
        const navRp = document.querySelector('.nav-rp');
        if (navRp) navRp.textContent = `✨ ${Math.round(Number(data.balance.rating) || 0).toLocaleString()} RP`;
      }
    } catch (err) {
      if (!silent) setMessage(err instanceof Error ? err.message : '투자 정보를 불러오지 못했어.');
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    fetchMarket();
    const timer = window.setInterval(() => fetchMarket(true), 5000);
    return () => window.clearInterval(timer);
  }, [fetchMarket]);

  const selected = market?.quotes.find((q) => q.symbol === symbol);
  const holding = market?.holdings.find((h) => h.symbol === symbol);
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const price = Number(selected?.price || 0);
  const total = price * qty;
  const maxBuy = price > 0 && market ? Math.floor(market.balance.rating / price) : 0;
  const maxSell = holding?.quantity || 0;
  const canSubmit = qty >= 1 && !busy && Boolean(selected) && (side === 'buy' ? qty <= maxBuy : qty <= maxSell);
  const portfolioValue = useMemo(() => (market?.holdings || []).reduce((sum, h) => sum + h.value, 0), [market]);

  const submit = async () => {
    if (!canSubmit) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const action = side === 'buy' ? '매수' : '매도';
    if (!window.confirm(`${selected?.name} ${qty}주를 ${action}할까?\n예상 금액: ${formatRp(total)}`)) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/invest/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ symbol, side, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '주문에 실패했어.');
      setMessage(`✅ ${data.name} ${qty}주 ${action} 완료 · 체결가 ${formatRp(data.price)}`);
      await fetchMarket(true);
    } catch (err) { setMessage(err instanceof Error ? err.message : '주문에 실패했어.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="container" style={{ padding: '3rem 0', maxWidth: 1100, margin: '0 auto' }}>
      <section className="problem-card" style={{ padding: '1.5rem', margin: 0 }}>
        <div style={{ fontSize: '.8rem', opacity: .65, fontWeight: 800 }}>REAL KRX PRICE · RP VIRTUAL INVESTING</div>
        <h2 style={{ margin: '.35rem 0' }}>📈 실제 주가 투자</h2>
        <p style={{ margin: 0, opacity: .72 }}>실제 한국 주식 시세를 그대로 사용하고, 매수·매도에는 RP만 사용해. 실제 금융상품 거래는 아니야.</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <b>보유 RP {formatRp(market?.balance.rating || 0)}</b>
          <b>주식 평가액 {formatRp(portfolioValue)}</b>
          <b>총 자산 {formatRp((market?.balance.rating || 0) + portfolioValue)}</b>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(300px,.8fr)', gap: '1rem', marginTop: '1rem' }}>
        <section className="problem-card" style={{ margin: 0, padding: '1.25rem' }}>
          <h3>종목</h3>
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {(market?.quotes || []).map((q) => (
              <button key={q.symbol} type="button" onClick={() => setSymbol(q.symbol)} style={{ textAlign: 'left', padding: '1rem', borderRadius: '.8rem', border: symbol === q.symbol ? '2px solid var(--color-4)' : '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><b>{q.name} <small style={{ opacity: .55 }}>{q.symbol}</small></b><b>{formatRp(q.price)}</b></div>
                <div style={{ marginTop: '.25rem', color: q.changePercent >= 0 ? '#2e9b62' : '#d84a4a', fontWeight: 800 }}>{q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%</div>
              </button>
            ))}
          </div>
          {loading && <div style={{ marginTop: '1rem', opacity: .65 }}>실제 시세 불러오는 중...</div>}

          <h3 style={{ marginTop: '1.5rem' }}>내 보유 주식</h3>
          {(market?.holdings || []).length === 0 ? <div style={{ opacity: .6 }}>아직 보유한 주식이 없어.</div> : (market?.holdings || []).map((h) => (
            <div key={h.symbol} style={{ padding: '.85rem 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{h.name} {h.quantity}주</b><b>{formatRp(h.value)}</b></div>
              <small>평균 {formatRp(h.averagePrice)} · 손익 <span style={{ color: h.profit >= 0 ? '#2e9b62' : '#d84a4a' }}>{formatRp(h.profit)} ({h.profitPercent.toFixed(2)}%)</span></small>
            </div>
          ))}
        </section>

        <section className="problem-card" style={{ margin: 0, padding: '1.25rem' }}>
          <h3>{selected?.name || '종목 선택'}</h3>
          <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{selected ? formatRp(selected.price) : '—'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', margin: '1rem 0' }}>
            <button className="btn" onClick={() => setSide('buy')} style={{ background: side === 'buy' ? 'var(--color-4)' : 'var(--bg-color)', color: side === 'buy' ? 'white' : 'var(--text-main)' }}>매수</button>
            <button className="btn" onClick={() => setSide('sell')} style={{ background: side === 'sell' ? '#d84a4a' : 'var(--bg-color)', color: side === 'sell' ? 'white' : 'var(--text-main)' }}>매도</button>
          </div>
          <label htmlFor="stock-qty"><b>수량</b></label>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.4rem' }}>
            <input id="stock-qty" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '.75rem', border: '1px solid var(--border)', borderRadius: '.65rem', background: 'var(--card-bg)', color: 'var(--text-main)' }} />
            <button className="btn" type="button" onClick={() => setQuantity(String(side === 'buy' ? maxBuy : maxSell))} style={{ width: 'auto' }}>MAX</button>
          </div>
          <small style={{ opacity: .65 }}>최대 {side === 'buy' ? maxBuy : maxSell}주</small>
          <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>예상 체결금액</span><b>{formatRp(total)}</b></div>
            <div style={{ marginTop: '.4rem', fontSize: '.8rem', opacity: .6 }}>수수료 0 RP · 현재 실제 주가 기준</div>
          </div>
          <button className="btn" disabled={!canSubmit} onClick={submit} style={{ marginTop: '1rem', background: canSubmit ? (side === 'buy' ? 'var(--color-4)' : '#d84a4a') : 'var(--border)', color: canSubmit ? 'white' : 'var(--text-muted)' }}>{busy ? '처리 중...' : `${qty}주 ${side === 'buy' ? '매수' : '매도'}`}</button>
        </section>
      </div>

      {message && <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '.8rem', fontWeight: 800 }}>{message}</div>}
      <section className="problem-card" style={{ marginTop: '1rem', padding: '1.25rem' }}>
        <h3>최근 거래</h3>
        {(market?.trades || []).length === 0 ? <div style={{ opacity: .6 }}>거래 기록이 없어.</div> : (market?.trades || []).slice(0, 10).map((t, i) => <div key={`${t.created_at}-${i}`} style={{ padding: '.6rem 0', borderBottom: '1px solid var(--border)' }}>{t.name} · {t.side === 'buy' ? '매수' : '매도'} {t.quantity}주 · {formatRp(t.price)}</div>)}
      </section>
    </main>
  );
}

export default function StockMarketNav() {
  const [active, setActive] = useState(() => window.location.pathname === MARKET_PATH);
  useEffect(() => {
    const sync = () => setActive(window.location.pathname === MARKET_PATH);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  if (!active) return null;
  const root = document.getElementById('root');
  if (!root) return null;
  return createPortal(<StockMarketPage />, root);
}
