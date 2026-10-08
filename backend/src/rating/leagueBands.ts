/**
 * 주간 리그를 티어 밴드로 나눈다.
 *
 * 왜 바꾸나: 실제 분포가 1위 7.4M, 3위 1.0M, 중간값 16만이라 **하나의 전역 순위**에서는
 * 신규·중위권이 영원히 상위권에 못 든다. 또 "그 주 10만 RP" 같은 절대 기준은
 * 총 레이팅 16만인 사람에게는 도달 불가라 보상이 상위 2명 전용이 된다.
 * 그래서 ① 같은 밴드끼리 겨루고 ② 보상 조건을 **참여 조건**(그 주 정답 N문제)으로 바꾼다.
 *
 * 순수 함수라 DB 없이 테스트할 수 있다.
 */

export type LeagueBandId = 'rookie' | 'gold' | 'diamond' | 'master';

export type LeagueBand = {
  id: LeagueBandId;
  label: string;
  /** 이 밴드에 속하는 티어 이름들(사이트 티어 목록과 맞춘다) */
  tiers: string[];
  /** 밴드 1·2·3위 토큰 (높은 밴드일수록 크다) */
  rewards: number[];
};

/** 보상을 받으려면 그 주에 정답을 이만큼 맞혀야 한다(0점 참가 방지). */
export const LEAGUE_MIN_SOLVED = 3;

export const LEAGUE_BANDS: LeagueBand[] = [
  { id: 'rookie', label: '루키 리그', tiers: ['Bronze', 'Silver'], rewards: [60, 40, 20] },
  { id: 'gold', label: '골드 리그', tiers: ['Gold', 'Platinum'], rewards: [90, 60, 30] },
  { id: 'diamond', label: '다이아 리그', tiers: ['Diamond', 'Ruby', 'Master'], rewards: [120, 80, 40] },
  {
    id: 'master',
    label: '마스터 리그',
    tiers: ['God', 'Hacker', '치피치피차파차파', 'ChatGPT', '출제자', '주인장', '정답'],
    rewards: [150, 100, 50]
  }
];

export const bandById = (id: LeagueBandId): LeagueBand =>
  LEAGUE_BANDS.find((band) => band.id === id) || LEAGUE_BANDS[0];

/** 티어 이름 → 밴드. 모르는 티어·빈 값은 가장 낮은 밴드로(벌점이 아니라 안전한 기본값). */
export const bandForTier = (tier: string | null | undefined): LeagueBandId => {
  const found = LEAGUE_BANDS.find((band) => band.tiers.includes(String(tier || '')));
  return found ? found.id : 'rookie';
};

/**
 * 한 밴드의 수상자.
 * 등수는 **원래 순서**로 매기고, 참여 조건을 못 채운 사람은 건너뛴다 — 보상은 그 등수의 금액이다
 * (2위가 조건 미달이면 3위는 2위 금액이 아니라 3위 금액을 받는다).
 */
export const pickBandWinners = <T extends { score: number | string; solved: number | string }>(
  rows: T[],
  bandId: LeagueBandId,
  minSolved: number = LEAGUE_MIN_SOLVED
): (T & { rank: number; tokens: number; band: LeagueBandId })[] => {
  const rewards = bandById(bandId).rewards;
  return rows
    .map((row, idx) => ({ ...row, rank: idx + 1 }))
    .filter((row) => row.rank <= rewards.length && Number(row.solved) >= minSolved)
    .map((row) => ({ ...row, band: bandId, tokens: rewards[row.rank - 1] }));
};
