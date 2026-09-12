export const MIN_EXCHANGE_RP = 10_000;
export const MAX_SAFE_RP = Number.MAX_SAFE_INTEGER;

export interface ExchangeQuote {
  requestedRp: number;
  exchangedRp: number;
  tokensReceived: number;
  baseTokens: number;
  bonusTokens: number;
  rawTokens: number;
}

export const progressiveTokenCount = (rp: number): number => {
  if (!Number.isSafeInteger(rp) || rp < 0) return 0;
  return Math.floor(rp / MIN_EXCHANGE_RP);
};

export const calculateExchangeQuote = (requestedRp: number): ExchangeQuote | null => {
  if (!Number.isSafeInteger(requestedRp) || requestedRp < MIN_EXCHANGE_RP || requestedRp > MAX_SAFE_RP) return null;
  const tokensReceived = progressiveTokenCount(requestedRp);
  const exchangedRp = tokensReceived * MIN_EXCHANGE_RP;

  return {
    requestedRp,
    exchangedRp,
    tokensReceived,
    baseTokens: tokensReceived,
    bonusTokens: 0,
    rawTokens: tokensReceived,
  };
};

export const getMaxExchangeRp = (currentRp: number): number => {
  if (!Number.isFinite(currentRp) || currentRp < MIN_EXCHANGE_RP) return 0;
  return Math.floor(currentRp / MIN_EXCHANGE_RP) * MIN_EXCHANGE_RP;
};
