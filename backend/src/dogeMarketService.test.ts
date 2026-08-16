import { describe, expect, it } from 'vitest';
import { parseTradeAmount } from './dogeMarketService';

describe('DOGE 거래 수량 검증', () => {
  it('매수 RP는 소수점 둘째 자리까지 허용한다', () => {
    expect(parseTradeAmount(1000.25, 'buy')).toBe('1000.25');
  });

  it('매도 DP는 소수점 여덟째 자리까지 허용한다', () => {
    expect(parseTradeAmount(0.12345678, 'sell')).toBe('0.12345678');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '100'])('잘못된 거래 입력을 거부한다: %s', (value) => {
    expect(() => parseTradeAmount(value, 'buy')).toThrow();
  });

  it('소수점 자릿수와 최대 거래량을 제한한다', () => {
    expect(() => parseTradeAmount(1.001, 'buy')).toThrow();
    expect(() => parseTradeAmount(0.123456789, 'sell')).toThrow();
    expect(() => parseTradeAmount(1_000_000_000_001, 'buy')).toThrow();
  });
});
