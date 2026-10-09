import { describe, it, expect } from 'vitest';
import {
  QUEST_DEFS,
  buildDailyQuests,
  progressQuests,
  questRewardTotal,
  questsAreStale,
  seedFrom,
  type Quest,
} from '../quests/dailyQuests.js';

const DAY = '2026-10-09';
const fresh = (overrides: Partial<Quest> = {}): Quest => ({
  id: `${DAY}:solve`,
  dayKey: DAY,
  type: 'solve',
  title: '문제 3개 풀기',
  current: 0,
  target: 3,
  completed: false,
  xpReward: 40,
  tokenReward: 15,
  ...overrides,
});

describe('일일 퀘스트 생성', () => {
  it('하루에 3개, 종류가 겹치지 않는다', () => {
    const quests = buildDailyQuests(78, DAY);
    expect(quests).toHaveLength(3);
    expect(new Set(quests.map((q) => q.type)).size).toBe(3);
    expect(quests.map((q) => q.type)).toContain('solve');
    expect(quests.map((q) => q.type)).toContain('perfect');
  });

  it('같은 유저·같은 날이면 항상 같은 퀘스트(새로고침마다 바뀌면 안 됨)', () => {
    expect(buildDailyQuests(78, DAY)).toEqual(buildDailyQuests(78, DAY));
    expect(seedFrom(78, DAY)).toBe(seedFrom(78, DAY));
  });

  it('유저나 날이 바뀌면 다른 퀘스트가 나온다', () => {
    expect(seedFrom(78, DAY)).not.toBe(seedFrom(79, DAY));
    expect(seedFrom(78, DAY)).not.toBe(seedFrom(78, '2026-10-10'));
  });

  it('목표치는 정의된 범위 안이고 보상은 항상 양수다', () => {
    for (const userId of [1, 7, 78, 9999]) {
      for (const day of ['2026-10-09', '2026-10-10', '2026-10-11']) {
        for (const quest of buildDailyQuests(userId, day)) {
          expect(QUEST_DEFS[quest.type].targets).toContain(quest.target);
          expect(quest.xpReward).toBeGreaterThan(0);
          expect(quest.tokenReward).toBeGreaterThan(0);
          expect(quest.current).toBe(0);
          expect(quest.completed).toBe(false);
          expect(quest.id.startsWith(day)).toBe(true);
        }
      }
    }
  });

  it('오늘 것이 아니면 낡은 퀘스트로 본다', () => {
    expect(questsAreStale(buildDailyQuests(78, DAY), DAY)).toBe(false);
    expect(questsAreStale(buildDailyQuests(78, DAY), '2026-10-10')).toBe(true);
    expect(questsAreStale([], DAY)).toBe(true);
    expect(questsAreStale(null, DAY)).toBe(true);
    expect(questsAreStale([{ type: 'solve' }], DAY)).toBe(true);
  });
});

describe('퀘스트 진행', () => {
  it('문제를 풀면 solve 진행이 오르고 목표에서 완료된다', () => {
    let quests = [fresh({ target: 3 })];
    for (let i = 1; i <= 2; i++) {
      const step = progressQuests(quests, { correct: i === 1 });
      quests = step.quests;
      expect(step.completed).toHaveLength(0);
      expect(quests[0].current).toBe(i);
    }
    const done = progressQuests(quests, { correct: true });
    expect(done.completed).toHaveLength(1);
    expect(done.quests[0].completed).toBe(true);
    expect(questRewardTotal(done.completed)).toEqual({ xp: 40, tokens: 15 });
  });

  it('연속 정답은 오답에서 끊긴다', () => {
    const perfect = fresh({ type: 'perfect', target: 2, current: 1, xpReward: 50, tokenReward: 20 });
    const broken = progressQuests([perfect], { correct: false });
    expect(broken.quests[0].current).toBe(0);
    expect(broken.completed).toHaveLength(0);

    const done = progressQuests([perfect], { correct: true });
    expect(done.quests[0].completed).toBe(true);
    expect(questRewardTotal(done.completed)).toEqual({ xp: 50, tokens: 20 });
  });

  it('레이팅 퀘스트는 이번 제출로 얻은 레이팅만큼 오른다', () => {
    const quest = fresh({ type: 'earn_xp', target: 10000, xpReward: 30, tokenReward: 25 });
    const partial = progressQuests([quest], { correct: true, ratingGained: 7000 });
    expect(partial.quests[0].current).toBe(7000);
    expect(partial.completed).toHaveLength(0);

    const done = progressQuests(partial.quests, { correct: true, ratingGained: 7000 });
    expect(done.quests[0].completed).toBe(true);
    expect(done.completed).toHaveLength(1);

    const wrong = progressQuests([quest], { correct: false, ratingGained: 0 });
    expect(wrong.quests[0].current).toBe(0);
  });

  it('스트릭 퀘스트는 첫 정답에 완료된다', () => {
    const done = progressQuests(
      [fresh({ type: 'streak', target: 1, xpReward: 20 }), fresh({ id: 'other', type: 'solve' })],
      { correct: true }
    );
    expect(done.completed.map((q) => q.type)).toEqual(['streak']);
    expect(done.quests[1].current).toBe(1);
  });

  it('이미 완료한 퀘스트는 다시 보상을 주지 않는다', () => {
    const step = progressQuests([fresh({ completed: true, current: 3 })], { correct: true });
    expect(step.completed).toHaveLength(0);
    expect(step.quests[0].current).toBe(3);
  });

  it('완료 시 진행도는 목표에서 멈춘다', () => {
    const step = progressQuests([fresh({ target: 3, current: 2 })], { correct: true });
    expect(step.quests[0].current).toBe(3);
  });
});
