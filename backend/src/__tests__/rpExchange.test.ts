import { describe, expect, it } from 'vitest';
import {
  calculateExchangeQuote,
  canReceiveTokens,
  getMaxExchangeRp,
  progressiveTokenCount,
} from '../rpExchange.js';

describe('RP progressive exchange', () => {
  it.each([
    [4_999, 0],
    [5_000, 1],
    [49_999, 9],
    [50_000, 10],
    [50_001, 10],
    [199_999, 43],
    [200_000, 43],
    [200_001, 43],
    [499_999, 118],
    [500_000, 118],
    [500_001, 118],
    [999_999, 251],
    [1_000_000, 251],
    [1_000_001, 251],
  ])('calculates %s RP as %s whole tokens', (rp, expectedTokens) => {
    expect(progressiveTokenCount(rp)).toBe(expectedTokens);
  });

  it('calculates the progressive discount over every band', () => {
    const quote = calculateExchangeQuote(500_000);
    expect(quote.tokensReceived).toBe(118);
    expect(quote.exchangedRp).toBeLessThanOrEqual(500_000);
    expect(quote.tokensReceived - quote.baseTokens).toBe(quote.bonusTokens);
    expect(quote.bonusTokens).toBeGreaterThan(0);
  });

  it('rejects amounts below the minimum and invalid values', () => {
    expect(() => calculateExchangeQuote(4_999)).toThrow();
    expect(() => calculateExchangeQuote(0)).toThrow();
    expect(() => calculateExchangeQuote(-5_000)).toThrow();
    expect(() => calculateExchangeQuote(Number.NaN)).toThrow();
    expect(() => calculateExchangeQuote(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => calculateExchangeQuote(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it('does not expose a maximum exchange below the minimum', () => {
    expect(getMaxExchangeRp(4_999)).toBe(0);
    expect(getMaxExchangeRp(5_000)).toBe(5_000);
  });

  it('guards the integer token balance limit', () => {
    expect(canReceiveTokens(0, 118)).toBe(true);
    expect(canReceiveTokens(2_147_483_529, 118)).toBe(true);
    expect(canReceiveTokens(2_147_483_530, 118)).toBe(false);
    expect(canReceiveTokens(-1, 1)).toBe(false);
    expect(canReceiveTokens(1.5, 1)).toBe(false);
  });

  it('keeps exchange quotes deterministic for concurrent calculations', async () => {
    const quotes = await Promise.all(
      Array.from({ length: 20 }, () => Promise.resolve(calculateExchangeQuote(500_000))),
    );
    expect(quotes.every(quote => quote.tokensReceived === 118 && quote.exchangedRp === quotes[0].exchangedRp)).toBe(true);
  });
});
