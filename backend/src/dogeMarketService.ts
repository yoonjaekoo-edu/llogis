import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { getPool } from './db';

export const DOGE_TRADE_FEE_RATE = 0.025;
export const DOGE_TRADE_COOLDOWN_SECONDS = 30;
export const DOGE_PRICE_CACHE_TTL_SECONDS = 10;
export const DOGE_PRICE_MULTIPLIER = 1000;
export const DOGE_MAX_TRADE_AMOUNT = 1_000_000_000_000;

const DOGE_PRICE_API_URL = process.env.DOGE_PRICE_API_URL || 'https://api.coingecko.com/api/v3/simple/price';
const DOGE_FALLBACK_PRICE_API_URL = process.env.DOGE_FALLBACK_PRICE_API_URL || 'https://api.binance.com/api/v3/ticker/24hr';
const DOGE_PRICE_API_TIMEOUT_MS = 5000;

export type DogeTradeSide = 'buy' | 'sell';

export interface DogePrice {
  priceUsd: string;
  dpPriceRp: string;
  priceChange24h: string;
  updatedAt: string;
}

export class DogeMarketError extends Error {
  public readonly code: 'MARKET_UNAVAILABLE' | 'TRADE_COOLDOWN' | 'INVALID_TRADE';
  public readonly status: number;
  public readonly remainingSeconds?: number;

  constructor(
    code: 'MARKET_UNAVAILABLE' | 'TRADE_COOLDOWN' | 'INVALID_TRADE',
    message: string,
    status: number,
    remainingSeconds?: number,
  ) {
    super(message);
    this.name = 'DogeMarketError';
    this.code = code;
    this.status = status;
    this.remainingSeconds = remainingSeconds;
  }
}

interface DogeTradeResult {
  side: DogeTradeSide;
  price: DogePrice;
  feeRp: number;
  rpChange: number;
  dpAmount: number;
  rp: number;
  dp: number;
  costBasisRp: number;
  averageBuyPrice: number;
  nextTradeAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const asFiniteNumber = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const toNumber = (value: unknown): number => asFiniteNumber(value) ?? 0;

const toNumericString = (value: unknown): string => {
  const number = asFiniteNumber(value);
  if (number === null || number <= 0) throw new Error('Invalid numeric value');
  return String(number);
};

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

export const parseTradeAmount = (value: unknown, side: DogeTradeSide): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('거래 수량은 0보다 큰 유한한 숫자여야 합니다.');
  }

  const text = String(value);
  const match = text.match(/^(\d+)(?:\.(\d+))?$/);
  const maxScale = side === 'buy' ? 2 : 8;
  if (!match || (match[2]?.length ?? 0) > maxScale || value > DOGE_MAX_TRADE_AMOUNT) {
    throw new Error(`거래 수량은 소수점 이하 ${maxScale}자리까지 입력할 수 있습니다.`);
  }

  const integerPart = match[1].replace(/^0+(?=\d)/, '');
  const fractionPart = match[2] ? `.${match[2]}` : '';
  return `${integerPart}${fractionPart}`;
};

const fetchCoinGeckoDogePrice = async (): Promise<{ priceUsd: string; priceChange24h: string }> => {
  const url = new URL(DOGE_PRICE_API_URL);
  url.searchParams.set('ids', 'dogecoin');
  url.searchParams.set('vs_currencies', 'usd');
  url.searchParams.set('include_24hr_change', 'true');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOGE_PRICE_API_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`DOGE price API returned ${response.status}`);

    const payload: unknown = await response.json();
    const dogecoin = isRecord(payload) ? payload.dogecoin : undefined;
    if (!isRecord(dogecoin)) throw new Error('DOGE price is missing');

    const priceUsd = toNumericString(dogecoin.usd);
    const priceChange24h = asFiniteNumber(dogecoin.usd_24h_change);
    return { priceUsd, priceChange24h: String(priceChange24h ?? 0) };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchBinanceDogePrice = async (): Promise<{ priceUsd: string; priceChange24h: string }> => {
  const url = new URL(DOGE_FALLBACK_PRICE_API_URL);
  url.searchParams.set('symbol', 'DOGEUSDT');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOGE_PRICE_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`DOGE fallback API returned ${response.status}`);

    const payload: unknown = await response.json();
    if (!isRecord(payload)) throw new Error('DOGE fallback price is missing');

    return {
      priceUsd: toNumericString(payload.lastPrice),
      priceChange24h: String(asFiniteNumber(payload.priceChangePercent) ?? 0),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchRemoteDogePrice = async (): Promise<{ priceUsd: string; priceChange24h: string }> => {
  try {
    return await fetchCoinGeckoDogePrice();
  } catch (primaryError) {
    console.warn('[DOGE] CoinGecko 시세 조회 실패, Binance로 전환합니다:', getErrorMessage(primaryError));
  }

  try {
    return await fetchBinanceDogePrice();
  } catch (fallbackError) {
    console.error('[DOGE] 모든 시세 공급자 조회 실패:', getErrorMessage(fallbackError));
    throw new DogeMarketError('MARKET_UNAVAILABLE', 'DOGE 가격 정보를 가져올 수 없습니다.', 503);
  }
};

const getCachedPrice = (row: QueryResultRow): DogePrice => ({
  priceUsd: String(row.price_usd),
  dpPriceRp: String(row.dp_price_rp),
  priceChange24h: String(row.price_change_24h ?? 0),
  updatedAt: new Date(row.updated_at).toISOString(),
});

export const getDogePrice = async (db: Pool = getPool()): Promise<DogePrice> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO doge_market_price (id, price_usd, dp_price_rp, price_change_24h, updated_at)
      VALUES (1, 0, 0, 0, NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    const cachedResult = await client.query(
      'SELECT price_usd, dp_price_rp, price_change_24h, updated_at FROM doge_market_price WHERE id = 1 FOR UPDATE',
    );
    const cached = cachedResult.rows[0];
    const isFresh = cached && Number(cached.price_usd) > 0
      && (Date.now() - new Date(cached.updated_at).getTime()) < DOGE_PRICE_CACHE_TTL_SECONDS * 1000;

    if (isFresh) {
      await client.query('COMMIT');
      return getCachedPrice(cached);
    }

    let remote: { priceUsd: string; priceChange24h: string };
    try {
      remote = await fetchRemoteDogePrice();
    } catch (error) {
      if (cached && Number(cached.price_usd) > 0) {
        await client.query('COMMIT');
        console.warn('[DOGE] 외부 시세 장애로 마지막 캐시 가격을 반환합니다.');
        return getCachedPrice(cached);
      }
      throw error;
    }
    const updated = await client.query(`
      UPDATE doge_market_price
      SET price_usd = $1, dp_price_rp = $1::numeric * $2::numeric, price_change_24h = $3, updated_at = NOW()
      WHERE id = 1
      RETURNING price_usd, dp_price_rp, price_change_24h, updated_at
    `, [remote.priceUsd, DOGE_PRICE_MULTIPLIER, remote.priceChange24h]);
    await client.query(`
      INSERT INTO doge_market_price_history (price_usd, dp_price_rp, recorded_at)
      VALUES ($1, $2, NOW())
    `, [remote.priceUsd, updated.rows[0].dp_price_rp]);
    await client.query('COMMIT');
    return getCachedPrice(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof DogeMarketError) throw error;
    throw new DogeMarketError('MARKET_UNAVAILABLE', 'DOGE 가격 정보를 사용할 수 없습니다.', 503);
  } finally {
    client.release();
  }
};

const numericSnapshot = (row: QueryResultRow) => ({
  rp: toNumber(row.rating),
  dp: toNumber(row.dp),
  costBasisRp: toNumber(row.cost_basis_rp),
});

export const getDogeMarketSnapshot = async (userId: number) => {
  const price = await getDogePrice();
  const db = getPool();
  await db.query('INSERT INTO doge_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  const [userResult, walletResult, tradesResult, historyResult] = await Promise.all([
    db.query('SELECT rating FROM users WHERE id = $1', [userId]),
    db.query('SELECT dp, cost_basis_rp, last_trade_at FROM doge_wallets WHERE user_id = $1', [userId]),
    db.query(`
      SELECT side, dp_amount, dp_price_rp, gross_rp, fee_rp, rp_change, created_at
      FROM doge_trades WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
    `, [userId]),
    db.query(`
      SELECT price_usd, recorded_at FROM doge_market_price_history
      WHERE recorded_at > NOW() - INTERVAL '24 hours'
      ORDER BY recorded_at ASC LIMIT 120
    `),
  ]);

  if (userResult.rows.length === 0 || walletResult.rows.length === 0) {
    throw new DogeMarketError('MARKET_UNAVAILABLE', '사용자 지갑을 찾을 수 없습니다.', 404);
  }

  const wallet = numericSnapshot({ ...userResult.rows[0], ...walletResult.rows[0] });
  const currentPrice = Number(price.dpPriceRp);
  const valuationRp = wallet.dp * currentPrice;
  const averageBuyPrice = wallet.dp > 0 ? wallet.costBasisRp / wallet.dp : 0;
  const profitLossRp = valuationRp - wallet.costBasisRp;
  const returnRate = wallet.costBasisRp > 0 ? (profitLossRp / wallet.costBasisRp) * 100 : 0;
  const lastTradeAt = walletResult.rows[0].last_trade_at
    ? new Date(walletResult.rows[0].last_trade_at).toISOString()
    : null;

  return {
    price,
    wallet: { ...wallet, valuationRp, averageBuyPrice, profitLossRp, returnRate, lastTradeAt },
    trades: tradesResult.rows,
    history: historyResult.rows.map(row => ({ priceUsd: toNumber(row.price_usd), recordedAt: new Date(row.recorded_at).toISOString() })),
  };
};

const getTradeCalculation = async (client: PoolClient, side: DogeTradeSide, amount: string, dpPriceRp: string) => {
  if (side === 'buy') {
    const result = await client.query(`
      SELECT ROUND($1::numeric * $2::numeric, 2) AS fee_rp,
             TRUNC(($1::numeric - ROUND($1::numeric * $2::numeric, 2)) / $3::numeric, 8) AS dp_amount
    `, [amount, DOGE_TRADE_FEE_RATE, dpPriceRp]);
    return { feeRp: String(result.rows[0].fee_rp), dpAmount: String(result.rows[0].dp_amount), grossRp: amount, rpChange: `-${amount}` };
  }

  const result = await client.query(`
    SELECT ROUND($1::numeric * $2::numeric, 2) AS gross_rp,
           ROUND($1::numeric * $2::numeric * $3::numeric, 2) AS fee_rp,
           ROUND(($1::numeric * $2::numeric) - ROUND($1::numeric * $2::numeric * $3::numeric, 2), 2) AS net_rp
  `, [amount, dpPriceRp, DOGE_TRADE_FEE_RATE]);
  const grossRp = String(result.rows[0].gross_rp);
  const feeRp = String(result.rows[0].fee_rp);
  const netRp = String(result.rows[0].net_rp);
  return { feeRp, dpAmount: amount, grossRp, rpChange: netRp };
};

export const tradeDoge = async (userId: number, side: DogeTradeSide, rawAmount: unknown): Promise<DogeTradeResult> => {
  let amount: string;
  try {
    amount = parseTradeAmount(rawAmount, side);
  } catch (error) {
    throw new DogeMarketError('INVALID_TRADE', error instanceof Error ? error.message : '잘못된 거래 수량입니다.', 400);
  }

  const price = await getDogePrice();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query('SELECT rating FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new DogeMarketError('MARKET_UNAVAILABLE', '사용자를 찾을 수 없습니다.', 404);
    }

    await client.query('INSERT INTO doge_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const walletResult = await client.query(
      `SELECT dp, cost_basis_rp, last_trade_at,
              EXTRACT(EPOCH FROM (NOW() - last_trade_at)) AS elapsed_seconds
       FROM doge_wallets WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const wallet = walletResult.rows[0];
    if (wallet.last_trade_at) {
      const elapsedSeconds = Number(wallet.elapsed_seconds);
      if (elapsedSeconds < DOGE_TRADE_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.max(1, Math.ceil(DOGE_TRADE_COOLDOWN_SECONDS - elapsedSeconds));
        await client.query('ROLLBACK');
        throw new DogeMarketError('TRADE_COOLDOWN', '거래 쿨다운이 아직 끝나지 않았습니다.', 429, remainingSeconds);
      }
    }

    const calculation = await getTradeCalculation(client, side, amount, price.dpPriceRp);
    if (Number(calculation.dpAmount) <= 0 || Number(calculation.rpChange) === 0 && side === 'sell') {
      await client.query('ROLLBACK');
      throw new DogeMarketError('INVALID_TRADE', '거래 가능한 최소 수량보다 작습니다.', 400);
    }

    let rating: string;
    let dp: string;
    let costBasisRp: string;
    if (side === 'buy') {
      const updatedUser = await client.query(
        'UPDATE users SET rating = (rating::numeric - $1::numeric)::double precision WHERE id = $2 AND rating::numeric >= $1::numeric RETURNING rating',
        [amount, userId],
      );
      if (updatedUser.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new DogeMarketError('INVALID_TRADE', 'RP가 부족합니다.', 400);
      }
      rating = String(updatedUser.rows[0].rating);
      const updatedWallet = await client.query(`
        UPDATE doge_wallets
        SET dp = dp + $1::numeric, cost_basis_rp = cost_basis_rp + $2::numeric, last_trade_at = NOW()
        WHERE user_id = $3
        RETURNING dp, cost_basis_rp, last_trade_at
      `, [calculation.dpAmount, amount, userId]);
      dp = String(updatedWallet.rows[0].dp);
      costBasisRp = String(updatedWallet.rows[0].cost_basis_rp);
      await client.query(`
        INSERT INTO doge_trades (user_id, side, dp_amount, dp_price_rp, gross_rp, fee_rp, rp_change)
        VALUES ($1, 'buy', $2, $3, $4, $5, $6)
      `, [userId, calculation.dpAmount, price.dpPriceRp, calculation.grossRp, calculation.feeRp, calculation.rpChange]);
    } else {
      const updatedWallet = await client.query(`
        UPDATE doge_wallets
        SET dp = dp - $1::numeric,
            cost_basis_rp = CASE WHEN dp = $1::numeric THEN 0
              ELSE GREATEST(0, cost_basis_rp - (cost_basis_rp * $1::numeric / NULLIF(dp, 0))) END,
            last_trade_at = NOW()
        WHERE user_id = $2 AND dp >= $1::numeric
        RETURNING dp, cost_basis_rp, last_trade_at
      `, [amount, userId]);
      if (updatedWallet.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new DogeMarketError('INVALID_TRADE', 'DP 보유량이 부족합니다.', 400);
      }
      const updatedUser = await client.query(
        'UPDATE users SET rating = (rating::numeric + $1::numeric)::double precision WHERE id = $2 RETURNING rating',
        [calculation.rpChange, userId],
      );
      rating = String(updatedUser.rows[0].rating);
      dp = String(updatedWallet.rows[0].dp);
      costBasisRp = String(updatedWallet.rows[0].cost_basis_rp);
      await client.query(`
        INSERT INTO doge_trades (user_id, side, dp_amount, dp_price_rp, gross_rp, fee_rp, rp_change)
        VALUES ($1, 'sell', $2, $3, $4, $5, $6)
      `, [userId, amount, price.dpPriceRp, calculation.grossRp, calculation.feeRp, calculation.rpChange]);
    }

    const walletNumeric = { dp: Number(dp), costBasisRp: Number(costBasisRp) };
    const nextTradeAt = new Date(Date.now() + DOGE_TRADE_COOLDOWN_SECONDS * 1000).toISOString();
    await client.query('COMMIT');
    return {
      side,
      price,
      feeRp: Number(calculation.feeRp),
      rpChange: Number(calculation.rpChange),
      dpAmount: Number(calculation.dpAmount),
      rp: Number(rating),
      dp: walletNumeric.dp,
      costBasisRp: walletNumeric.costBasisRp,
      averageBuyPrice: walletNumeric.dp > 0 ? walletNumeric.costBasisRp / walletNumeric.dp : 0,
      nextTradeAt,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};