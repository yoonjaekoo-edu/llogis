/**
 * 주간 리그 보상 규칙.
 *
 * 등수는 원래 순위로 매기고, 기준 점수를 넘긴 사람에게만 **그 등수의** 보상을 준다.
 * (2위가 기준 미달이면 3위는 2위 보상(100)이 아니라 3위 보상(50)을 받아야 한다.)
 * 순수 함수라 DB 없이 테스트할 수 있다.
 */

export const LEAGUE_REWARD_TOKENS = [150, 100, 50];

/** 보상을 받으려면 그 주에 이만큼의 레이팅을 벌어야 한다. */
export const LEAGUE_MIN_SCORE = 100000;

export const pickLeagueWinners = <T extends { score: number | string }>(
  rows: T[],
  minScore: number = LEAGUE_MIN_SCORE,
  tokens: number[] = LEAGUE_REWARD_TOKENS
): (T & { rank: number; tokens: number })[] =>
  rows
    .map((row, idx) => ({ ...row, rank: idx + 1 }))
    .filter((row) => row.rank <= tokens.length && Number(row.score) >= minScore)
    .map((row) => ({ ...row, tokens: tokens[row.rank - 1] }));
