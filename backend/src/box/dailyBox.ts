/**
 * 상자깡(매일 상자) 보상 규칙.
 *
 * 규칙
 * - 하루 1개(KST 기준 날짜), 연속 방문(스트릭)이 길수록 **기본 등급**이 올라간다.
 * - 여기에 더해 등급이 뛰어오를 **확률 업그레이드**가 있다: 한 단계 위(연속 방문이 길수록 확률↑, 최대 45%),
 *   두 단계 위(최대 12%). 확률은 스트릭에 따라 매일 조회 화면에 그대로 공개한다.
 * - 등급이 정해진 뒤 **잭팟**(10%)이 터지면 그 등급 보상의 1.5배를 받는다.
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

/** 하루 1개 상자의 확률표 — 화면에 그대로 보여준다(가챠는 확률을 숨기면 신뢰를 잃는다). */
export type BoxOdds = {
  /** 한 단계(또는 두 단계) 위 등급이 나올 확률 */
  plus1: number;
  /** 두 단계 위 등급이 나올 확률(plus1에 포함) */
  plus2: number;
  /** 잭팟(보상 1.5배) 확률 */
  jackpot: number;
};

/** 한 단계 이상 위 등급이 나올 확률 — 연속 방문이 길수록 커진다(최대 0.45). */
export const upgradeChance = (streak: number): number => {
  const days = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  return Math.min(0.45, Math.round((0.1 + days * 0.02) * 100) / 100);
};

/** 두 단계 위 등급이 나올 확률 — 희귀한 대박(최대 0.12). upgradeChance에 포함되는 값이다. */
export const doubleUpgradeChance = (streak: number): number => {
  const days = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  return Math.min(0.12, Math.round((0.02 + days * 0.01) * 100) / 100);
};

/** 잭팟 확률과 배수 — 등급과 무관하게 고정. */
export const JACKPOT_CHANCE = 0.1;
export const JACKPOT_MULTIPLIER = 1.5;

/** 이 스트릭에서 오늘 상자의 확률표. */
export const boxOdds = (streak: number): BoxOdds => ({
  plus1: upgradeChance(streak),
  plus2: doubleUpgradeChance(streak),
  jackpot: JACKPOT_CHANCE,
});

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
  /** 몇 단계 뛰었는지(0 = 기본 등급 그대로) */
  upgradedBy: number;
  jackpot: boolean;
  ratingReward: number;
  tokenReward: number;
  odds: BoxOdds;
};

/**
 * 오늘의 상자를 연다. rand는 0 이상 1 미만 난수 주입(테스트용).
 *
 * 굴림 순서: ① 두 단계 업그레이드 ② 아니면 한 단계 ③ 등급 확정 후 잭팟.
 * 기본 등급은 스트릭이 보장하므로 **내려가는 일은 없다**(연속 방문이 손해가 되면 안 된다).
 */
export const rollDailyBox = (streak: number, rand: () => number = Math.random): BoxRoll => {
  const baseRarity = rarityForStreak(streak);
  const baseIdx = BOX_RARITY_ORDER.indexOf(baseRarity);
  const maxIdx = BOX_RARITY_ORDER.length - 1;
  const canUpgrade = baseIdx < maxIdx;

  let upgradedBy = 0;
  if (canUpgrade) {
    if (rand() < doubleUpgradeChance(streak)) upgradedBy = 2;
    else if (rand() < upgradeChance(streak)) upgradedBy = 1;
  }
  const idx = Math.min(maxIdx, baseIdx + upgradedBy);
  const rarity = BOX_RARITY_ORDER[idx];
  const tier = BOX_TIERS[rarity];

  const jackpot = rand() < JACKPOT_CHANCE;
  const scale = jackpot ? JACKPOT_MULTIPLIER : 1;

  return {
    rarity,
    baseRarity,
    upgraded: upgradedBy > 0,
    upgradedBy: idx - baseIdx,
    jackpot,
    ratingReward: Math.round(rollIn(tier.rating, rand) * scale),
    tokenReward: Math.round(rollIn(tier.tokens, rand) * scale),
    odds: boxOdds(streak),
  };
};
