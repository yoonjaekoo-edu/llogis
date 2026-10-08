import { describe, it, expect } from 'vitest';
import { pickLeagueWinners } from '../rating/leagueWinners.js';

const TOKENS = [150, 100, 50];
const MIN = 100000;
const row = (username: string, score: number) => ({ user_id: username.length, username, score });

describe('pickLeagueWinners (주간 리그 정산)', () => {
  it('기준 점수를 넘긴 사람이 없으면 아무도 받지 않는다', () => {
    expect(pickLeagueWinners([row('a', 99000), row('b', 50000)], MIN, TOKENS)).toEqual([]);
  });

  it('세 명이 모두 넘기면 150 / 100 / 50 토큰', () => {
    const winners = pickLeagueWinners([row('a', 300000), row('b', 200000), row('c', 150000)], MIN, TOKENS);
    expect(winners.map(w => [w.rank, w.tokens])).toEqual([[1, 150], [2, 100], [3, 50]]);
  });

  it('2위가 기준 미달이면 3위는 2위 보상이 아니라 3위 보상을 받는다', () => {
    const winners = pickLeagueWinners([row('a', 300000), row('b', 50000), row('c', 150000)], MIN, TOKENS);
    expect(winners.map(w => [w.username, w.rank, w.tokens])).toEqual([['a', 1, 150], ['c', 3, 50]]);
  });

  it('1위가 미달이고 2·3위만 넘기면 그 등수의 보상만 나간다', () => {
    const winners = pickLeagueWinners([row('a', 1000), row('b', 200000), row('c', 120000)], MIN, TOKENS);
    expect(winners.map(w => [w.rank, w.tokens])).toEqual([[2, 100], [3, 50]]);
  });

  it('정확히 기준 점수면 포함된다(경계값)', () => {
    expect(pickLeagueWinners([row('a', MIN)], MIN, TOKENS)).toHaveLength(1);
  });

  it('4위부터는 보상이 없다(토큰 배열 길이까지만)', () => {
    const winners = pickLeagueWinners(
      [row('a', 400000), row('b', 300000), row('c', 200000), row('d', 150000)],
      MIN,
      TOKENS
    );
    expect(winners.map(w => w.username)).toEqual(['a', 'b', 'c']);
  });

  it('점수는 문자열로 와도 숫자로 비교한다(DB의 NUMERIC/BIGINT)', () => {
    const winners = pickLeagueWinners([{ user_id: 1, username: 'a', score: '150000' }], MIN, TOKENS);
    expect(winners[0].tokens).toBe(150);
  });
});
