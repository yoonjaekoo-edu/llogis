export const MIN_EXCHANGE_RP = 5_000;
export const MAX_SAFE_RP = Number.MAX_SAFE_INTEGER;

const SCALE = 1_260_000n;

const bands = [
  { end: 50_000n, multiplier: 252n }, // SCALE / 5,000
  { end: 200_000n, multiplier: 280n }, // SCALE / 4,500
  { end: 500_000n, multiplier: 315n }, // SCALE / 4,000
  { end: 1_000_000n, multiplier: 336n }, // SCALE / 3,750
  { end: null, multiplier: 360n }, // SCALE / 3,500
] as const;

export interface ExchangeQuote {
  requestedRp: number;
  exchangedRp: number;
  tokensReceived: number;
  baseTokens: number;
  bonusTokens: number;
  rawTokens: number;
}

const toScaledTokens = (rp: bigint): bigint => {
  let remaining = rp;
  let previousEnd = 0n;
  let total = 0n;

  for (const band of bands) {
    const amount = band.end === null
      ? remaining
      : remaining > band.end - previousEnd
        ? band.end - previousEnd
        : remaining;
    if (amount <= 0n) break;
    total += amount * band.multiplier;
    remaining -= amount;
    if (band.end !== null) previousEnd = band.end;
  }

  return total;
};

export const progressiveTokenCount = (rp: number): number => {
  if (!Number.isSafeInteger(rp) || rp < 0) return 0;
  return Number(toScaledTokens(BigInt(rp)) / SCALE);
};

const findChargeableRp = (requestedRp: number, tokensReceived: number): number => {
  let low = MIN_EXCHANGE_RP;
  let high = requestedRp;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (progressiveTokenCount(middle) >= tokensReceived) high = middle;
    else low = middle + 1;
  }

  return low;
};

export const calculateExchangeQuote = (requestedRp: number): ExchangeQuote | null => {
  if (!Number.isSafeInteger(requestedRp) || requestedRp < MIN_EXCHANGE_RP || requestedRp > MAX_SAFE_RP) return null;
  const requestedTokens = progressiveTokenCount(requestedRp);
  const exchangedRp = findChargeableRp(requestedRp, requestedTokens);
  const exchangedScaledTokens = toScaledTokens(BigInt(exchangedRp));
  const tokensReceived = Number(exchangedScaledTokens / SCALE);
  const baseTokens = Math.floor(exchangedRp / 5_000);

  return {
    requestedRp,
    exchangedRp,
    tokensReceived,
    baseTokens,
    bonusTokens: Math.max(0, tokensReceived - baseTokens),
    rawTokens: Number(exchangedScaledTokens) / Number(SCALE),
  };
};

export const getMaxExchangeRp = (currentRp: number): number => {
  if (!Number.isFinite(currentRp) || currentRp < MIN_EXCHANGE_RP) return 0;
  return calculateExchangeQuote(Math.min(Math.floor(currentRp), MAX_SAFE_RP))?.exchangedRp || 0;
};
