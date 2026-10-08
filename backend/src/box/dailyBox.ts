/**
 * 상자깡(매일 상자) 보상 규칙.
 *
 * 규칙
 * - 하루 1개(KST 기준 날짜), 연속 방문(스트릭)이 길수록 **기본 등급**이 올라간다.
 * - 여기에 더해 한 단계 위 등급이 나올 **확률 업그레이드**가 있다(연속 방문이 길수록 확률↑, 최대 50%).
 * - 보상은 서버가 정하고 서버가 지급한다(클라이언트는 등급을 고를 수 없다).
 *
 * 순수 함수라 DB 없이 테스트할 수 있다(난수는 주입받는다).
 */

export type BoxRarity = 'common' | 'rare' | 'epic' | 'heroic' | 'legendary';

export const BOX_RARITY_ORDER: BoxRarity[] = ['common', 'rare', 'epic', 'heroic', 'legendary'];

export type BoxTier = {
  label: string;
  /** 이 등급이 기본으로 나오는 연속 방문일 */
  minStreak: number;
  rating: [number, number];
  tokens: [number, number];
};

export const BOX_TIERS: Record<BoxRarity, BoxTier> = {
  common: { label: '일반', minStreak: 0, rating: [3000, 6000], tokens: [3, 10] },
  rare: { label: '고급', minStreak: 3, rating: [6000, 12000], tokens: [8, 20] },
  epic: { label: '희귀', minStreak: 7, rating: [12000, 25000], tokens: [15, 35] },
  heroic: { label: '영웅', minStreak: 14, rating: [25000, 45000], tokens: [30, 60] },
  legendary: { label: '전설', minStreak: 30, rating: [45000, 80000], tokens: [60, 120] },
};

/** 연속 방문일로 정해지는 기본 등급. 연속이 끊기면 다시 일반부터 시작한다. */
export const rarityForStreak = (streak: number): BoxRarity => {
  const days = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  let rarity: BoxRarity = 'common';
  for (const r of BOX_RARITY_ORDER) {
    if (days >= BOX_TIERS[r].minStreak) rarity = r;
  }
  return rarity;
};

/** 한 단계 위 등급이 나올 확률 — 연속 방문이 길수록 커진다(최대 0.5). */
export const upgradeChance = (streak: number): number => {
  const days = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  return Math.min(0.5, Math.round((0.1 + days * 0.02) * 100) / 100);
};

/** 다음 등급까지 남은 연속 방문일. 이미 최고 등급이면 null. */
export const daysToNextRarity = (streak: number): { next: BoxRarity; days: number } | null => {
  const days = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  for (const r of BOX_RARITY_ORDER) {
    const need = BOX_TIERS[r].minStreak;
    if (days < need) return { next: r, days: need - days };
  }
  return null;
};

const rollIn = ([min, max]: [number, number], rand: () => number): number =>
  min + Math.floor(rand() * (max - min + 1));

export type BoxRoll = {
  rarity: BoxRarity;
  baseRarity: BoxRarity;
  upgraded: boolean;
  ratingReward: number;
  tokenReward: number;
};

/** 오늘의 상자를 연다. rand는 0 이상 1 미만 난수 주입(테스트용). */
export const rollDailyBox = (streak: number, rand: () => number = Math.random): BoxRoll => {
  const baseRarity = rarityForStreak(streak);
  const idx = BOX_RARITY_ORDER.indexOf(baseRarity);
  const canUpgrade = idx < BOX_RARITY_ORDER.length - 1;
  const upgraded = canUpgrade && rand() < upgradeChance(streak);
  const rarity = upgraded ? BOX_RARITY_ORDER[idx + 1] : baseRarity;
  const tier = BOX_TIERS[rarity];
  return {
    rarity,
    baseRarity,
    upgraded,
    ratingReward: rollIn(tier.rating, rand),
    tokenReward: rollIn(tier.tokens, rand),
  };
};
