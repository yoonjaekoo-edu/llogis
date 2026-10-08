import { describe, it, expect } from 'vitest';
import { LEAGUE_BANDS, LEAGUE_MIN_SOLVED, bandById, bandForTier, pickBandWinners } from '../rating/leagueBands.js';

const row = (username: string, score: number, solved: number) => ({ user_id: username.length, username, score, solved });

describe('리그 밴드', () => {
  it('모든 티어가 정확히 한 밴드에만 속한다', () => {
    const seen = new Map<string, string>();
    for (const band of LEAGUE_BANDS) {
      for (const tier of band.tiers) {
        expect(seen.has(tier), `${tier}가 두 밴드에 있음`).toBe(false);
        seen.set(tier, band.id);
      }
    }
    expect(seen.get('Bronze')).toBe('rookie');
    expect(seen.get('Silver')).toBe('rookie');
    expect(seen.get('Gold')).toBe('gold');
    expect(seen.get('Platinum')).toBe('gold');
    expect(seen.get('Diamond')).toBe('diamond');
    expect(seen.get('Master')).toBe('diamond');
    expect(seen.get('God')).toBe('master');
    expect(seen.get('정답')).toBe('master');
  });

  it('모르는 티어·빈 값은 루키로 본다', () => {
    expect(bandForTier('???')).toBe('rookie');
    expect(bandForTier(null)).toBe('rookie');
    expect(bandForTier(undefined)).toBe('rookie');
  });

  it('밴드가 높을수록 보상이 크다', () => {
    const rookie = bandById('rookie').rewards[0];
    const gold = bandById('gold').rewards[0];
    const diamond = bandById('diamond').rewards[0];
    const master = bandById('master').rewards[0];
    expect(gold).toBeGreaterThan(rookie);
    expect(diamond).toBeGreaterThan(gold);
    expect(master).toBeGreaterThan(diamond);
  });
});

describe('pickBandWinners', () => {
  it('참여 조건(정답 N문제)을 못 채우면 보상이 없다', () => {
    const rows = [row('a', 50000, LEAGUE_MIN_SOLVED - 1), row('b', 30000, 1)];
    expect(pickBandWinners(rows, 'rookie')).toEqual([]);
  });

  it('밴드 1·2·3위에 밴드 금액을 준다', () => {
    const winners = pickBandWinners([row('a', 90000, 5), row('b', 70000, 4), row('c', 60000, 3)], 'gold');
    expect(winners.map(w => [w.rank, w.tokens])).toEqual([[1, 90], [2, 60], [3, 30]]);
  });

  it('2위가 조건 미달이면 3위는 3위 금액을 받는다', () => {
    const winners = pickBandWinners([row('a', 90000, 5), row('b', 70000, 1), row('c', 60000, 4)], 'rookie');
    expect(winners.map(w => [w.username, w.rank, w.tokens])).toEqual([['a', 1, 60], ['c', 3, 20]]);
  });

  it('4위부터는 보상이 없다', () => {
    const winners = pickBandWinners(
      [row('a', 90000, 5), row('b', 80000, 5), row('c', 70000, 5), row('d', 60000, 5)],
      'diamond'
    );
    expect(winners.map(w => w.username)).toEqual(['a', 'b', 'c']);
  });

  it('점수가 문자열로 와도 숫자로 비교한다(DB NUMERIC)', () => {
    const winners = pickBandWinners([{ user_id: 1, username: 'a', score: '88000', solved: '4' }], 'master');
    expect(winners[0].tokens).toBe(150);
  });

  it('조건을 만족한 사람이 없으면 아무도 못 받는다', () => {
    expect(pickBandWinners([row('a', 999999, 2)], 'master')).toEqual([]);
  });
});
