import { describe, it, expect } from 'vitest';
import {
  BOX_RARITY_ORDER,
  BOX_TIERS,
  JACKPOT_CHANCE,
  JACKPOT_MULTIPLIER,
  boxOdds,
  daysToNextRarity,
  doubleUpgradeChance,
  rarityForStreak,
  rollDailyBox,
  upgradeChance,
} from '../box/dailyBox.js';

// 난수를 순서대로 소비하고, 다 쓰면 0.9(대부분의 확률 판정 실패 값)를 돌려준다.
// 굴림 순서: ① 두 단계 ② 한 단계 ③ 잭팟 ④ 레이팅 ⑤ 토큰
const fixed = (...values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.9);
};

describe('상자깡 등급 규칙', () => {
  it('연속 방문일이 길수록 기본 등급이 올라간다', () => {
    expect(rarityForStreak(0)).toBe('common');
    expect(rarityForStreak(2)).toBe('common');
    expect(rarityForStreak(3)).toBe('rare');
    expect(rarityForStreak(6)).toBe('rare');
    expect(rarityForStreak(7)).toBe('epic');
    expect(rarityForStreak(13)).toBe('epic');
    expect(rarityForStreak(14)).toBe('heroic');
    expect(rarityForStreak(29)).toBe('heroic');
    expect(rarityForStreak(30)).toBe('legendary');
    expect(rarityForStreak(365)).toBe('legendary');
  });

  it('이상한 스트릭 값(음수/NaN)은 일반 등급으로 취급한다', () => {
    expect(rarityForStreak(-5)).toBe('common');
    expect(rarityForStreak(NaN)).toBe('common');
  });

  it('등급 상승 확률은 연속 방문이 길수록 커지고 45%에서 멈춘다', () => {
    expect(upgradeChance(0)).toBe(0.1);
    expect(upgradeChance(5)).toBe(0.2);
    expect(upgradeChance(20)).toBe(0.45);
    expect(upgradeChance(200)).toBe(0.45);
  });

  it('두 단계 상승 확률은 한 단계 확률보다 항상 작고 12%에서 멈춘다', () => {
    for (const streak of [0, 1, 5, 10, 20, 50]) {
      expect(doubleUpgradeChance(streak)).toBeLessThanOrEqual(upgradeChance(streak));
    }
    expect(doubleUpgradeChance(0)).toBe(0.02);
    expect(doubleUpgradeChance(100)).toBe(0.12);
  });

  it('확률표는 스트릭에 따라 커지고 잭팟은 고정이다', () => {
    const odds = boxOdds(10);
    expect(odds.jackpot).toBe(JACKPOT_CHANCE);
    expect(odds.plus1).toBe(upgradeChance(10));
    expect(odds.plus2).toBe(doubleUpgradeChance(10));
    expect(boxOdds(20).plus1).toBeGreaterThan(boxOdds(0).plus1);
  });

  it('다음 등급까지 남은 일수를 알려준다', () => {
    expect(daysToNextRarity(0)).toEqual({ next: 'rare', days: 3 });
    expect(daysToNextRarity(5)).toEqual({ next: 'epic', days: 2 });
    expect(daysToNextRarity(30)).toBeNull();
  });
});

describe('상자깡 개봉', () => {
  it('상승 판정에 모두 실패하면 기본 등급이 나온다', () => {
    const roll = rollDailyBox(0, fixed(0.99, 0.99, 0.99, 0.5, 0.5));
    expect(roll.baseRarity).toBe('common');
    expect(roll.upgraded).toBe(false);
    expect(roll.upgradedBy).toBe(0);
    expect(roll.rarity).toBe('common');
  });

  it('한 단계 판정에 성공하면 한 단계 위 등급이 나온다', () => {
    const roll = rollDailyBox(0, fixed(0.5, 0.0, 0.99, 0.5, 0.5));
    expect(roll.upgraded).toBe(true);
    expect(roll.upgradedBy).toBe(1);
    expect(roll.rarity).toBe('rare');
  });

  it('두 단계 판정에 성공하면 두 단계 위 등급이 나온다', () => {
    const roll = rollDailyBox(0, fixed(0.0, 0.5, 0.99, 0.5, 0.5));
    expect(roll.upgraded).toBe(true);
    expect(roll.upgradedBy).toBe(2);
    expect(roll.rarity).toBe('epic');
  });

  it('전설 등급에서는 상승 판정을 하지 않는다', () => {
    const roll = rollDailyBox(30, fixed(0.0, 0.0, 0.99, 0.5, 0.5));
    expect(roll.rarity).toBe('legendary');
    expect(roll.upgraded).toBe(false);
    expect(roll.upgradedBy).toBe(0);
  });

  it('보상은 등급별 범위를 벗어나지 않는다(잭팟은 1.5배까지)', () => {
    for (const streak of [0, 5, 10, 20, 100]) {
      for (let i = 0; i < 300; i++) {
        const roll = rollDailyBox(streak);
        const tier = BOX_TIERS[roll.rarity];
        expect(roll.ratingReward).toBeGreaterThanOrEqual(tier.rating[0]);
        expect(roll.ratingReward).toBeLessThanOrEqual(Math.round(tier.rating[1] * JACKPOT_MULTIPLIER));
        expect(roll.tokenReward).toBeGreaterThanOrEqual(tier.tokens[0]);
        expect(roll.tokenReward).toBeLessThanOrEqual(Math.round(tier.tokens[1] * JACKPOT_MULTIPLIER));
        expect(BOX_RARITY_ORDER).toContain(roll.rarity);
      }
    }
  });

  it('최소 난수면 범위의 아래끝, 최대 난수면 위끝이 나온다(잭팟 없이)', () => {
    const min = rollDailyBox(0, fixed(0.99, 0.99, 0.99, 0, 0));
    expect(min.jackpot).toBe(false);
    expect(min.ratingReward).toBe(BOX_TIERS.common.rating[0]);
    expect(min.tokenReward).toBe(BOX_TIERS.common.tokens[0]);

    const max = rollDailyBox(0, fixed(0.99, 0.99, 0.99, 0.999999, 0.999999));
    expect(max.ratingReward).toBe(BOX_TIERS.common.rating[1]);
    expect(max.tokenReward).toBe(BOX_TIERS.common.tokens[1]);
  });

  it('잭팟이 터지면 같은 등급 보상의 1.5배를 받는다', () => {
    const plain = rollDailyBox(0, fixed(0.99, 0.99, 0.99, 0.5, 0.5));
    const jackpot = rollDailyBox(0, fixed(0.99, 0.99, 0.0, 0.5, 0.5));
    expect(jackpot.jackpot).toBe(true);
    expect(plain.jackpot).toBe(false);
    expect(jackpot.rarity).toBe(plain.rarity);
    expect(jackpot.ratingReward).toBe(Math.round(plain.ratingReward * JACKPOT_MULTIPLIER));
    expect(jackpot.tokenReward).toBe(Math.round(plain.tokenReward * JACKPOT_MULTIPLIER));
  });

  it('연속 방문이 길면 더 좋은 등급이 나올 확률이 높다', () => {
    const run = (streak: number) => {
      let sum = 0;
      for (let i = 0; i < 4000; i++) sum += BOX_TIERS[rollDailyBox(streak).rarity].rating[0];
      return sum / 4000;
    };
    expect(run(30)).toBeGreaterThan(run(7));
    expect(run(7)).toBeGreaterThan(run(0));
  });
});
