/**
 * 일일 퀘스트 규칙.
 *
 * 왜 필요한가: 프로필에 "오늘의 퀘스트" 카드와 `users.quests` 컬럼은 예전부터 있었지만
 * **퀘스트를 만들어 주는 서버 코드가 없었다**(항상 빈 카드 = 사이트가 안 지키는 약속).
 * 여기서 하루 3개를 만들고, 제출 이벤트로 진행을 올리고, 완료분 보상을 지급한다.
 *
 * 설계
 * - 같은 유저·같은 날이면 **항상 같은 퀘스트**가 나온다(해시 시드) — 새로고침마다 바뀌면
 *   "조금만 더 하면 되는데"가 사라져서 퀘스트가 의미를 잃는다.
 * - 보상은 **XP + 토큰**만 준다. 레이팅을 주면 주간 리그 점수를 퀘스트로 채울 수 있어서
 *   상자깡과 같은 이유로 제외한다(리그는 정답 획득분만).
 * - 순수 함수라 DB 없이 테스트할 수 있다.
 */

export type QuestType = 'solve' | 'perfect' | 'streak' | 'earn_xp';

export type Quest = {
  /** 하루 단위 id — 날이 바뀌면 새 퀘스트가 된다 */
  id: string;
  dayKey: string;
  type: QuestType;
  title: string;
  current: number;
  target: number;
  completed: boolean;
  xpReward: number;
  tokenReward: number;
};

type QuestDef = {
  /** 같은 종류라도 날마다 목표치가 달라지게 여러 값을 둔다 */
  targets: number[];
  xp: number;
  tokens: number;
  title: (target: number) => string;
};

export const QUEST_DEFS: Record<QuestType, QuestDef> = {
  solve: { targets: [3, 4, 5], xp: 40, tokens: 15, title: (t) => `문제 ${t}개 풀기` },
  perfect: { targets: [2, 3], xp: 50, tokens: 20, title: (t) => `연속 정답 ${t}번` },
  streak: { targets: [1], xp: 20, tokens: 10, title: () => '오늘 스트릭 이어가기' },
  earn_xp: { targets: [5000, 10000, 20000], xp: 30, tokens: 25, title: (t) => `오늘 레이팅 ${t.toLocaleString()} 얻기` },
};

/** 같은 유저·같은 날 → 같은 값. (FNV-1a) */
export const seedFrom = (userId: number, dayKey: string): number => {
  let hash = 2166136261;
  for (const ch of `${userId}|${dayKey}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
};

const makeQuest = (type: QuestType, dayKey: string, seed: number): Quest => {
  const def = QUEST_DEFS[type];
  const target = def.targets[seed % def.targets.length];
  return {
    id: `${dayKey}:${type}`,
    dayKey,
    type,
    title: def.title(target),
    current: 0,
    target,
    completed: false,
    xpReward: def.xp,
    tokenReward: def.tokens,
  };
};

/** 오늘의 퀘스트 3개. 세 번째는 날마다 스트릭/레이팅 중 하나로 바뀐다. */
export const buildDailyQuests = (userId: number, dayKey: string): Quest[] => {
  const seed = seedFrom(userId, dayKey);
  const third: QuestType = seed % 2 === 0 ? 'streak' : 'earn_xp';
  const types: QuestType[] = ['solve', 'perfect', third];
  return types.map((type, i) => makeQuest(type, dayKey, seed + i * 7));
};

/** 저장된 퀘스트가 오늘 것이 아니면 새로 만들어야 한다. */
export const questsAreStale = (quests: unknown, dayKey: string): boolean => {
  if (!Array.isArray(quests) || quests.length === 0) return true;
  return quests.some((q) => (q as Quest)?.dayKey !== dayKey);
};

export type QuestEvent = {
  /** 이번 제출이 정답이었나 */
  correct: boolean;
  /** 이번 제출로 얻은 레이팅(earn_xp 퀘스트용) */
  ratingGained?: number;
};

/**
 * 제출 하나를 퀘스트 진행에 반영한다.
 * `completed`에는 **이번에 새로 완료된** 퀘스트만 담긴다(보상 중복 지급 방지).
 */
export const progressQuests = (
  quests: Quest[],
  event: QuestEvent
): { quests: Quest[]; completed: Quest[] } => {
  const completed: Quest[] = [];
  const next = quests.map((quest) => {
    if (quest.completed) return quest;

    let current = quest.current;
    switch (quest.type) {
      case 'solve':
        current += 1;
        break;
      case 'perfect':
        // 오답이면 연속이 끊긴다
        current = event.correct ? current + 1 : 0;
        break;
      case 'streak':
        if (event.correct) current = Math.max(current, 1);
        break;
      case 'earn_xp':
        current += event.correct ? Math.max(0, Math.round(event.ratingGained || 0)) : 0;
        break;
    }

    const done = current >= quest.target;
    const updated: Quest = { ...quest, current: done ? quest.target : current, completed: done };
    if (done) completed.push(updated);
    return updated;
  });

  return { quests: next, completed };
};

/** 완료된 퀘스트들의 보상 합계. */
export const questRewardTotal = (completed: Quest[]): { xp: number; tokens: number } => ({
  xp: completed.reduce((sum, q) => sum + q.xpReward, 0),
  tokens: completed.reduce((sum, q) => sum + q.tokenReward, 0),
});
