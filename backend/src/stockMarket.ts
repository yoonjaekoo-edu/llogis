import type { Pool } from 'pg';

export type StockQuote = {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  changePercent: number;
  updatedAt: string;
};

const STOCKS = [
  { symbol: '005930', name: '삼성전자' },
  { symbol: '000660', name: 'SK하이닉스' },
  { symbol: '005380', name: '현대차' },
  { symbol: '035420', name: 'NAVER' },
];

const KIS_BASE_URL = process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443';
let cachedToken = '';
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const appkey = process.env.KIS_APP_KEY;
  const appsecret = process.env.KIS_APP_SECRET;
  if (!appkey || !appsecret) throw new Error('KIS API credentials are not configured');

  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey, appsecret }),
  });
  if (!res.ok) throw new Error(`KIS token request failed: ${res.status}`);
  const data: any = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000;
  return cachedToken;
}

export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
  const stock = STOCKS.find((item) => item.symbol === symbol);
  if (!stock) throw new Error('지원하지 않는 종목이야.');

  const token = await getAccessToken();
  const appkey = process.env.KIS_APP_KEY!;
  const appsecret = process.env.KIS_APP_SECRET!;
  const url = new URL(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`);
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
  url.searchParams.set('FID_INPUT_ISCD', symbol);

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey,
      appsecret,
      tr_id: 'FHKST01010100',
      custtype: 'P',
    },
  });
  if (!res.ok) throw new Error(`KIS quote request failed: ${res.status}`);
  const data: any = await res.json();
  if (data.rt_cd !== '0') throw new Error(data.msg1 || '시세 조회에 실패했어.');

  const output = data.output || {};
  const price = Number(output.stck_prpr || 0);
  const previousClose = Number(output.stck_sdpr || price);
  const changePercent = Number(output.prdy_ctrt || 0);
  if (!Number.isFinite(price) || price <= 0) throw new Error('유효한 현재가를 받지 못했어.');

  return {
    symbol,
    name: stock.name,
    price,
    previousClose,
    changePercent,
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchAllStockQuotes(): Promise<StockQuote[]> {
  return Promise.all(STOCKS.map((stock) => fetchStockQuote(stock.symbol)));
}

export function getSupportedStocks() {
  return STOCKS;
}

export async function ensureStockSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_holdings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol VARCHAR(12) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      average_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, symbol)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_trades (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol VARCHAR(12) NOT NULL,
      side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      price NUMERIC(18, 4) NOT NULL CHECK (price > 0),
      total NUMERIC(18, 4) NOT NULL CHECK (total > 0),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_stock_trades_user_created ON stock_trades(user_id, created_at DESC)');
}
