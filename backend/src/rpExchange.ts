export const MIN_EXCHANGE_RP = 10_000;
export const MAX_SAFE_RP = Number.MAX_SAFE_INTEGER;

const MAX_TOKEN_BALANCE = 2_147_483_647;

export interface ExchangeQuote {
  requestedRp: number;
  exchangedRp: number;
  tokensReceived: number;
  baseTokens: number;
  bonusTokens: number;
  rawTokens: number;
}

const assertValidRp = (rp: number): void => {
  if (!Number.isSafeInteger(rp) || rp < MIN_EXCHANGE_RP || rp > MAX_SAFE_RP) {
    throw new Error('환전 RP는 10,000 이상의 안전한 정수여야 합니다.');
  }
};

export const progressiveTokenCount = (rp: number): number => {
  if (!Number.isSafeInteger(rp) || rp < 0) {
    throw new Error('RP는 0 이상의 안전한 정수여야 합니다.');
  }
  return Math.floor(rp / MIN_EXCHANGE_RP);
};

export const calculateExchangeQuote = (requestedRp: number): ExchangeQuote => {
  assertValidRp(requestedRp);
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

export const canReceiveTokens = (currentTokens: number, tokensReceived: number): boolean =>
  Number.isSafeInteger(currentTokens) &&
  currentTokens >= 0 &&
  tokensReceived >= 0 &&
  tokensReceived <= MAX_TOKEN_BALANCE - currentTokens;

export { MAX_TOKEN_BALANCE };
