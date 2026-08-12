import { getPool } from '../db';
import { 
  getTodayString,
  getDaysDifference,
  generateDailyQuests,
  Quest
} from './gameSystemService';

const pool = getPool();

const MIN_REWARD = 5000;
const MAX_REWARD = 150000;

const getDefaultDifficulty = (isCustom: boolean): number => isCustom ? 60000 : 10000;

export interface TierEntry {
  name: string;
  minRating: number;
}

const DEFAULT_TIERS: TierEntry[] = [
  { name: 'Bronze', minRating: 0 },
  { name: 'Silver', minRating: 100000 },
  { name: 'Gold', minRating: 300000 },
  { name: 'Platinum', minRating: 800000 },
  { name: 'Diamond', minRating: 2000000 },
  { name: 'Ruby', minRating: 5000000 },
  { name: 'Master', minRating: 12000000 },
  { name: 'God', minRating: 30000000 },
  { name: 'Hacker', minRating: 70000000 },
  { name: '치피치피차파차파', minRating: 150000000 },
  { name: 'ChatGPT', minRating: 300000000 },
  { name: '출제자', minRating: 600000000 },
  { name: '주인장', minRating: 1200000000 },
  { name: '정답', minRating: 2500000000 },
];

let cachedTiers: TierEntry[] | null = null;
let lastFetch = 0;
const CACHE_TTL = 60000;

export const getTierConfig = async (): Promise<TierEntry[]> => {
  const now = Date.now();
  if (cachedTiers && now - lastFetch < CACHE_TTL) return cachedTiers;
  try {
    const res = await pool.query('SELECT config FROM tier_config WHERE id = 1');
    if (res.rows.length > 0 && res.rows[0].config?.tiers) {
      cachedTiers = res.rows[0].config.tiers as TierEntry[];
      lastFetch = now;
      return cachedTiers!;
    }
  } catch { }
  return DEFAULT_TIERS;
};

export const updateTierConfig = async (tiers: TierEntry[]): Promise<TierEntry[]> => {
  await pool.query(
    `INSERT INTO tier_config (id, config) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET config = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify({ tiers })]
  );
  cachedTiers = tiers;
  lastFetch = Date.now();
  return tiers;
};

const allTiers = async (): Promise<TierEntry[]> => {
  const tiers = await getTierConfig();
  return [...tiers].sort((a, b) => b.minRating - a.minRating);
};

export const getTierName = (rating: number, tiers: TierEntry[]): string => {
  const sorted = [...tiers].sort((a, b) => b.minRating - a.minRating);
  for (const t of sorted) {
    if (rating >= t.minRating) return t.name;
  }
  return sorted[sorted.length - 1]?.name || 'Bronze';
};

export const getTier = (rating: number): string => {
  const tiers = cachedTiers || DEFAULT_TIERS;
  return getTierName(rating, tiers);
};

const getWrongAnswerPenalty = (rating: number): number => {
  const tier = getTier(rating);
  if (tier === 'Bronze') return 500;
  if (tier === 'Silver') return 1000;
  if (tier === 'Gold') return 2000;
  return 3000;
};

export const calculateDifficultyFromSolveRate = (solveRate: number): number => {
  if (solveRate < 0 || solveRate > 1 || isNaN(solveRate)) return 10000;
  return Math.round(MAX_REWARD - (MAX_REWARD - MIN_REWARD) * solveRate);
};



export const processSubmission = async (
  userId: number,
  problemId: number,
  isCorrect: boolean,
  problemData?: { is_custom: boolean; current_difficulty: number | string | null; total_attempts: number; correct_attempts: number }
) => {
  const client = await pool.connect();
  const perf: string[] = [];
  let perfStart = Date.now();
  const perfMark = (label: string) => {
    perf.push(`${label}:${Date.now() - perfStart}ms`);
    perfStart = Date.now();
  };
  const perfLog = () => {
    if (process.env.LOG_SUBMISSION_PERF === '1') {
      console.log(`[submission-perf] user=${userId} problem=${problemId} correct=${isCorrect}: ${perf.join(' ')}`);
    }
  };
  try {
    await client.query('BEGIN');
    perfMark('begin');

    // 1. Duplicate check (must be first for correct answers)
    if (isCorrect) {
      const dup = await client.query(
        'SELECT id FROM submissions WHERE user_id = $1 AND problem_id = $2 AND is_correct = true FOR UPDATE',
        [userId, problemId]
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return { alreadySolved: true };
      }
    }
    perfMark('dupCheck');

    // 2. Fetch ALL user data once (replaces 6+ separate SELECTs)
    const userRes = await client.query(
      `SELECT rating, streak, tokens, xp, quests, last_active_date,
              streak_repaired, longest_streak, fever_multiplier, fever_expires_at,
              problems_solved
       FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (userRes.rows.length === 0) throw new Error('User not found');
    const u = userRes.rows[0];
    const today = getTodayString();
    perfMark('userSelect');

    // 3. Daily reset (in-memory, replaces handleDailyReset)
    let quests: Quest[] = Array.isArray(u.quests) ? u.quests : [];
    if (u.last_active_date !== today) {
      quests = generateDailyQuests();
    }

    // 4. Streak repair (replaces checkAndRepairStreak)
    let streakAfterRepair = u.streak || 0;
    let longestStreak = u.longest_streak || 0;
    let streakRepaired = false;
    let consumedRepair = false;
    let dbLastActiveDate = u.last_active_date;
    const kstOffset = 9 * 60 * 60 * 1000;

    if (u.last_active_date && u.last_active_date !== today) {
      const diff = getDaysDifference(u.last_active_date, today);
      if (diff >= 2) {
        if (u.streak_repaired) {
          const yesterdayKst = new Date(Date.now() + kstOffset);
          yesterdayKst.setDate(yesterdayKst.getDate() - 1);
          const yesterdayStr = yesterdayKst.toISOString().split('T')[0];
          await client.query(
            'INSERT INTO submissions (user_id, problem_id, is_correct, is_streak_repair, user_answer) VALUES ($1, NULL, TRUE, TRUE, $2)',
            [userId, '스트릭 리페어 사용']
          );
          dbLastActiveDate = yesterdayStr;
          streakRepaired = true;
          consumedRepair = true;
        } else {
          streakAfterRepair = 0;
          dbLastActiveDate = today;
        }
      }
    }

    // 5. Fever check (in-memory)
    let feverMultiplier = 1;
    let feverActive = false;
    if (u.fever_expires_at && new Date(u.fever_expires_at) > new Date() && u.fever_multiplier > 1) {
      feverMultiplier = u.fever_multiplier;
      feverActive = true;
    } else if (u.fever_expires_at && new Date(u.fever_expires_at) <= new Date()) {
      await client.query('UPDATE users SET fever_multiplier = 1.0, fever_expires_at = NULL WHERE id = $1', [userId]);
    }
    perfMark('streakFever');

    // 6. Problem update + difficulty in one round trip
    let prob: { is_custom: any; current_difficulty: any; total_attempts: any; correct_attempts: any };
    const calcDifficulty = (totalAttempts: number, correctAttempts: number): number => {
      const solveRate = totalAttempts > 0 ? correctAttempts / totalAttempts : 0.5;
      return calculateDifficultyFromSolveRate(solveRate);
    };
    if (problemData) {
      prob = { ...problemData };
      const newDifficulty = calcDifficulty(prob.total_attempts, prob.correct_attempts);
      await client.query(
        `UPDATE problems SET
          total_attempts = total_attempts + 1,
          correct_attempts = correct_attempts + $1,
          current_difficulty = $2
         WHERE id = $3`,
        [isCorrect ? 1 : 0, newDifficulty, problemId]
      );
    } else {
      const probRes = await client.query(
        `UPDATE problems SET
          total_attempts = total_attempts + 1,
          correct_attempts = correct_attempts + $1,
          current_difficulty = ROUND(150000 - 145000 * LEAST(1.0, GREATEST(0.0, (correct_attempts + $1)::float / NULLIF(total_attempts + 1, 0))))
         WHERE id = $2
         RETURNING is_custom, current_difficulty, total_attempts, correct_attempts`,
        [isCorrect ? 1 : 0, problemId]
      );
      if (probRes.rows.length === 0) throw new Error('Problem not found');
      prob = probRes.rows[0];
    }
    perfMark('problemUpdate');

    // 8. Daily bonus check
    let dailyBonusMultiplier = 1;
    if (isCorrect) {
      const todayRes = await client.query(
        "SELECT COUNT(*) as cnt FROM submissions WHERE user_id = $1 AND is_correct = TRUE AND submitted_at::date = $2::date",
        [userId, today]
      );
      if (parseInt(todayRes.rows[0]?.cnt || '0') === 0) {
        dailyBonusMultiplier = 1.5;
      }
    }
    perfMark('dailyCount');

    // 9. Rating computation
    const currentRating = parseFloat(u.rating);
    const defaultDiff = getDefaultDifficulty(prob.is_custom);
    const rewardRating = prob.current_difficulty != null ? Number(prob.current_difficulty) : defaultDiff;
    const baseDelta = isCorrect ? rewardRating : -getWrongAnswerPenalty(currentRating);
    const ratingDelta = isCorrect ? Math.round(baseDelta * feverMultiplier * dailyBonusMultiplier) : baseDelta;
    const finalRating = Math.max(0, currentRating + ratingDelta);

    // 10. Streak update (replaces updateStreak)
    let finalStreak = streakAfterRepair;
    let streakBonusTokens = 0;
    if (isCorrect && dbLastActiveDate !== today) {
      const diff = getDaysDifference(dbLastActiveDate || '', today);
      finalStreak = (diff === 1 || !dbLastActiveDate) ? streakAfterRepair + 1 : 1;
      dbLastActiveDate = today;
    }
    if (isCorrect) {
      if (finalStreak > longestStreak) longestStreak = finalStreak;
      if (finalStreak >= 30) streakBonusTokens = 5;
      else if (finalStreak >= 10) streakBonusTokens = 3;
      else if (finalStreak >= 5) streakBonusTokens = 1;
    }

    // 11. Token delta (replaces updateTokens)
    const tokenDelta = isCorrect ? 1 + streakBonusTokens : 0;

    // 12. Quest updates in-memory (replaces 4+ updateQuests calls)
    let xpGained = 0;
    let questTokensGained = 0;

    const processQuestAction = (action: string, data?: { isCorrect?: boolean; xpEarned?: number }) => {
      quests = quests.map((q) => {
        if (q.completed) return q;
        const updatedQ = { ...q };

        if (q.type === 'solve' && action === 'solve') {
          updatedQ.current += 1;
          if (updatedQ.current >= updatedQ.target) {
            updatedQ.completed = true;
            xpGained += updatedQ.xpReward;
            questTokensGained += updatedQ.tokenReward;
          }
        } else if (q.type === 'streak' && action === 'streak') {
          updatedQ.current = 1;
          updatedQ.completed = true;
          xpGained += updatedQ.xpReward;
          questTokensGained += updatedQ.tokenReward;
        } else if (q.type === 'accuracy' && (action === 'attempt' || action === 'solve')) {
          if (action === 'solve' && data?.isCorrect === false) return updatedQ;
          const total = (q.totalAttempts || 0) + 1;
          const corrects = (q.correctCount || 0) + (action === 'solve' && data?.isCorrect ? 1 : 0);
          updatedQ.totalAttempts = total;
          updatedQ.correctCount = corrects;
          const accuracy = total >= q.target ? Math.round((corrects / total) * 100) : 0;
          updatedQ.current = accuracy;
          if (total >= 3 && accuracy >= q.target) {
            updatedQ.completed = true;
            xpGained += updatedQ.xpReward;
            questTokensGained += updatedQ.tokenReward;
          }
        } else if (q.type === 'earn_xp' && action === 'earn_xp' && data?.xpEarned) {
          updatedQ.current += data.xpEarned;
          if (updatedQ.current >= updatedQ.target) {
            updatedQ.completed = true;
            xpGained += updatedQ.xpReward;
            questTokensGained += updatedQ.tokenReward;
          }
        } else if (q.type === 'consecutive' && action === 'solve') {
          if (data?.isCorrect) {
            const cc = (q.consecutiveCount || 0) + 1;
            updatedQ.consecutiveCount = cc;
            updatedQ.current = cc;
            if (cc >= q.target) {
              updatedQ.completed = true;
              xpGained += updatedQ.xpReward;
              questTokensGained += updatedQ.tokenReward;
            }
          } else {
            updatedQ.consecutiveCount = 0;
            updatedQ.current = 0;
          }
        } else if (q.type === 'perfect' && action === 'solve') {
          if (data?.isCorrect) {
            const cc = (q.consecutiveCount || 0) + 1;
            updatedQ.consecutiveCount = cc;
            updatedQ.current = cc;
            if (cc >= q.target) {
              updatedQ.completed = true;
              xpGained += updatedQ.xpReward;
              questTokensGained += updatedQ.tokenReward;
            }
          } else {
            updatedQ.consecutiveCount = 0;
            updatedQ.current = 0;
          }
        }

        return updatedQ;
      });
    };

    if (isCorrect) {
      const xpEarnedForQuest = Math.max(1, Math.floor(rewardRating / 100));
      processQuestAction('solve', { isCorrect: true });
      processQuestAction('streak');
      processQuestAction('earn_xp', { xpEarned: xpEarnedForQuest });
      processQuestAction('solve', { isCorrect: true });
    } else {
      processQuestAction('attempt', { isCorrect: false });
      processQuestAction('solve', { isCorrect: false });
    }

    // 13. XP
    const xpEarned = isCorrect ? Math.max(1, Math.floor(rewardRating / 100)) : 0;

    // 14. Single batched user UPDATE (replaces 6+ separate UPDATEs)
    const finalLastActiveDate = isCorrect ? today : dbLastActiveDate;
    const finalStreakRepaired = consumedRepair ? false : u.streak_repaired;
    const finalTokens = (u.tokens || 0) + tokenDelta + questTokensGained;
    const finalXp = (u.xp || 0) + xpEarned + xpGained;
    const finalProblemsSolved = isCorrect ? (u.problems_solved || 0) + 1 : u.problems_solved || 0;

    await client.query(
      `UPDATE users SET
        rating = $1, streak = $2, last_active_date = $3, streak_repaired = $4,
        longest_streak = $5, tokens = $6, xp = $7, quests = $8, problems_solved = $9
       WHERE id = $10`,
       [finalRating, finalStreak, finalLastActiveDate, finalStreakRepaired,
        longestStreak, finalTokens, finalXp, JSON.stringify(quests),
        finalProblemsSolved, userId]
    );
    perfMark('userUpdate');

    // 15. Submission + activity log in one CTE
    const feverDescription = feverActive ? ` (🔥${feverMultiplier}배 피버타임 적용)` : '';
    const dailyDescription = dailyBonusMultiplier > 1 ? ` (☀️첫 정답 1.5배)` : '';
    const activityDescription = isCorrect
      ? `정답 제출 보상 +${Math.round(rewardRating).toLocaleString()} RP${feverDescription}${dailyDescription}`
      : `오답 패널티 -${Math.abs(Math.round(ratingDelta)).toLocaleString()} RP`;

    await client.query(
      `WITH sub_insert AS (
        INSERT INTO submissions (user_id, problem_id, is_correct) VALUES ($1, $2, $3) RETURNING id
      )
      INSERT INTO rating_activity_logs (user_id, problem_id, activity_type, change_amount, before_rating, after_rating, description)
      SELECT $1, $2, $4, $5, $6, $7, $8 FROM sub_insert`,
       [userId, problemId, isCorrect, isCorrect ? 'correct_reward' : 'wrong_penalty',
        Math.round(ratingDelta), currentRating, finalRating, activityDescription]
    );
    perfMark('insertLog');

    await client.query('COMMIT');
    perfMark('commit');
    perfLog();

    const level = Math.floor(Math.sqrt(finalXp / 100)) + 1;

    return {
      newUserRating: finalRating,
      tier: getTier(finalRating),
      level,
      streak: finalStreak,
      tokens: finalTokens,
      xp: finalXp,
      quests,
      streakRepaired,
      streakRepairedFlag: finalStreakRepaired,
      problems_solved: finalProblemsSolved,
      feverActive,
      feverMultiplier,
    };
  } catch (err: any) {
    perfLog();
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return { alreadySolved: true };
    }
    throw err;
  } finally {
    client.release();
  }
};
