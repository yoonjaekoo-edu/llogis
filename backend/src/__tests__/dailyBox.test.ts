import { describe, it, expect } from 'vitest';
import {
  BOX_RARITY_ORDER,
  BOX_TIERS,
  daysToNextRarity,
  rarityForStreak,
  rollDailyBox,
  upgradeChance,
} from '../box/dailyBox.js';

// 난수를 고정해 결과를 재현 가능하게 만든다
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const low = () => 0;

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

  it('업그레이드 확률은 연속 방문이 길수록 커지고 50%에서 멈춘다', () => {
    expect(upgradeChance(0)).toBe(0.1);
    expect(upgradeChance(5)).toBe(0.2);
    expect(upgradeChance(20)).toBe(0.5);
    expect(upgradeChance(200)).toBe(0.5);
  });

  it('다음 등급까지 남은 일수를 알려준다', () => {
    expect(daysToNextRarity(0)).toEqual({ next: 'rare', days: 3 });
    expect(daysToNextRarity(5)).toEqual({ next: 'epic', days: 2 });
    expect(daysToNextRarity(30)).toBeNull();
  });
});

describe('상자깡 개봉', () => {
  it('업그레이드 판정에 실패하면 기본 등급이 나온다', () => {
    // 첫 난수(업그레이드 판정)가 크면 실패, 이후 난수는 보상 범위 안
    const roll = rollDailyBox(0, seq(0.99, 0.5, 0.5));
    expect(roll.baseRarity).toBe('common');
    expect(roll.upgraded).toBe(false);
    expect(roll.rarity).toBe('common');
  });

  it('업그레이드 판정에 성공하면 한 단계 위 등급이 나온다', () => {
    const roll = rollDailyBox(0, seq(0.0, 0.5, 0.5));
    expect(roll.baseRarity).toBe('common');
    expect(roll.upgraded).toBe(true);
    expect(roll.rarity).toBe('rare');
  });

  it('전설 등급은 업그레이드 대상이 아니다', () => {
    const roll = rollDailyBox(30, low);
    expect(roll.rarity).toBe('legendary');
    expect(roll.upgraded).toBe(false);
  });

  it('보상은 등급별 범위를 벗어나지 않는다', () => {
    const streaks = [0, 5, 10, 20, 100];
    for (const streak of streaks) {
      for (let i = 0; i < 400; i++) {
        const roll = rollDailyBox(streak);
        const tier = BOX_TIERS[roll.rarity];
        expect(roll.ratingReward).toBeGreaterThanOrEqual(tier.rating[0]);
        expect(roll.ratingReward).toBeLessThanOrEqual(tier.rating[1]);
        expect(roll.tokenReward).toBeGreaterThanOrEqual(tier.tokens[0]);
        expect(roll.tokenReward).toBeLessThanOrEqual(tier.tokens[1]);
        expect(BOX_RARITY_ORDER).toContain(roll.rarity);
      }
    }
  });

  it('최소 난수면 범위의 아래끝, 최대 난수면 위끝이 나온다', () => {
    const min = rollDailyBox(0, seq(0.99, 0, 0)); // 업그레이드 실패 + 보상 최소
    expect(min.ratingReward).toBe(BOX_TIERS.common.rating[0]);
    expect(min.tokenReward).toBe(BOX_TIERS.common.tokens[0]);

    const max = rollDailyBox(0, seq(0.99, 0.999999, 0.999999));
    expect(max.ratingReward).toBe(BOX_TIERS.common.rating[1]);
    expect(max.tokenReward).toBe(BOX_TIERS.common.tokens[1]);
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
