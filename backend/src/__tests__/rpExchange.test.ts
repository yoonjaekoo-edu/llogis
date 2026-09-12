import { describe, expect, it } from 'vitest';
import {
  calculateExchangeQuote,
  canReceiveTokens,
  getMaxExchangeRp,
  progressiveTokenCount,
} from '../rpExchange.js';

describe('RP 토큰 환전', () => {
  it.each([
    [9_999, 0],
    [10_000, 1],
    [19_999, 1],
    [20_000, 2],
    [500_000, 50],
  ])('calculates %s RP as %s whole tokens', (rp, expectedTokens) => {
    expect(progressiveTokenCount(rp)).toBe(expectedTokens);
  });

  it('charges 10,000 RP for each token and preserves the remainder', () => {
    const quote = calculateExchangeQuote(25_999);
    expect(quote.tokensReceived).toBe(2);
    expect(quote.exchangedRp).toBe(20_000);
    expect(quote.bonusTokens).toBe(0);
  });

  it('rejects amounts below the minimum and invalid values', () => {
    expect(() => calculateExchangeQuote(9_999)).toThrow();
    expect(() => calculateExchangeQuote(0)).toThrow();
    expect(() => calculateExchangeQuote(-10_000)).toThrow();
    expect(() => calculateExchangeQuote(Number.NaN)).toThrow();
    expect(() => calculateExchangeQuote(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => calculateExchangeQuote(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it('does not expose a maximum exchange below the minimum', () => {
    expect(getMaxExchangeRp(9_999)).toBe(0);
    expect(getMaxExchangeRp(25_999)).toBe(20_000);
  });

  it('guards the integer token balance limit', () => {
    expect(canReceiveTokens(0, 50)).toBe(true);
    expect(canReceiveTokens(2_147_483_597, 50)).toBe(true);
    expect(canReceiveTokens(2_147_483_598, 50)).toBe(false);
    expect(canReceiveTokens(-1, 1)).toBe(false);
    expect(canReceiveTokens(1.5, 1)).toBe(false);
  });
});
