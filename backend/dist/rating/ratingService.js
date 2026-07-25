"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSubmission = exports.calculateDifficultyFromSolveRate = exports.getTier = exports.getTierName = exports.updateTierConfig = exports.getTierConfig = void 0;
const pg_1 = require("pg");
const gameSystemService_1 = require("./gameSystemService");
const pool = new pg_1.Pool({
    user: process.env.DB_USER || 'mathuser',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_NAME || 'math_solved',
    password: process.env.DB_PASSWORD || 'mathpass',
    port: parseInt(process.env.DB_PORT || '5432'),
});
const MIN_REWARD = 5000;
const MAX_REWARD = 150000;
const getDefaultDifficulty = (isCustom) => isCustom ? 60000 : 10000;
const DEFAULT_TIERS = [
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
let cachedTiers = null;
let lastFetch = 0;
const CACHE_TTL = 60000;
const getTierConfig = async () => {
    const now = Date.now();
    if (cachedTiers && now - lastFetch < CACHE_TTL)
        return cachedTiers;
    try {
        const res = await pool.query('SELECT config FROM tier_config WHERE id = 1');
        if (res.rows.length > 0 && res.rows[0].config?.tiers) {
            cachedTiers = res.rows[0].config.tiers;
            lastFetch = now;
            return cachedTiers;
        }
    }
    catch { }
    return DEFAULT_TIERS;
};
exports.getTierConfig = getTierConfig;
const updateTierConfig = async (tiers) => {
    await pool.query(`INSERT INTO tier_config (id, config) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET config = $1::jsonb, updated_at = NOW()`, [JSON.stringify({ tiers })]);
    cachedTiers = tiers;
    lastFetch = Date.now();
    return tiers;
};
exports.updateTierConfig = updateTierConfig;
const allTiers = async () => {
    const tiers = await (0, exports.getTierConfig)();
    return [...tiers].sort((a, b) => b.minRating - a.minRating);
};
const getTierName = (rating, tiers) => {
    const sorted = [...tiers].sort((a, b) => b.minRating - a.minRating);
    for (const t of sorted) {
        if (rating >= t.minRating)
            return t.name;
    }
    return sorted[sorted.length - 1]?.name || 'Bronze';
};
exports.getTierName = getTierName;
const getTier = (rating) => {
    const tiers = cachedTiers || DEFAULT_TIERS;
    return (0, exports.getTierName)(rating, tiers);
};
exports.getTier = getTier;
const getWrongAnswerPenalty = (rating) => {
    const tier = (0, exports.getTier)(rating);
    if (tier === 'Bronze')
        return 500;
    if (tier === 'Silver')
        return 1000;
    if (tier === 'Gold')
        return 2000;
    return 3000;
};
const calculateDifficultyFromSolveRate = (solveRate) => {
    if (solveRate < 0 || solveRate > 1 || isNaN(solveRate))
        return 10000;
    return Math.round(MAX_REWARD - (MAX_REWARD - MIN_REWARD) * solveRate);
};
exports.calculateDifficultyFromSolveRate = calculateDifficultyFromSolveRate;
const processSubmission = async (userId, problemId, isCorrect) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await (0, gameSystemService_1.handleDailyReset)(userId, client);
        const repairResult = await (0, gameSystemService_1.checkAndRepairStreak)(userId, client);
        const problemRes = await client.query('SELECT is_custom, current_difficulty FROM problems WHERE id = $1', [problemId]);
        if (problemRes.rows.length === 0) {
            throw new Error('Problem not found');
        }
        const { is_custom, current_difficulty } = problemRes.rows[0];
        const defaultDifficulty = getDefaultDifficulty(is_custom);
        const rewardRating = current_difficulty != null ? parseFloat(current_difficulty) : defaultDifficulty;
        const feverRes = await client.query('SELECT fever_multiplier, fever_expires_at FROM users WHERE id = $1', [userId]);
        let feverMultiplier = 1;
        let feverActive = false;
        if (feverRes.rows.length > 0) {
            const fm = feverRes.rows[0].fever_multiplier;
            const expiresAt = feverRes.rows[0].fever_expires_at;
            if (expiresAt && new Date(expiresAt) > new Date() && fm && fm > 1) {
                feverMultiplier = fm;
                feverActive = true;
            }
            else if (expiresAt && new Date(expiresAt) <= new Date()) {
                await client.query('UPDATE users SET fever_multiplier = 1.0, fever_expires_at = NULL WHERE id = $1', [userId]);
            }
        }
        const feverDescription = feverActive ? ` (🔥${feverMultiplier}배 피버타임 적용)` : '';
        const userRes = await client.query('SELECT rating FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (userRes.rows.length === 0) {
            throw new Error('User not found');
        }
        const currentRating = parseFloat(userRes.rows[0].rating);
        let dailyBonusMultiplier = 1;
        if (isCorrect) {
            const todayStr = (0, gameSystemService_1.getTodayString)();
            const todayRes = await client.query("SELECT COUNT(*) as cnt FROM submissions WHERE user_id = $1 AND is_correct = TRUE AND submitted_at::date = $2::date", [userId, todayStr]);
            const todayCorrectCount = parseInt(todayRes.rows[0]?.cnt || '0');
            if (todayCorrectCount === 0) {
                dailyBonusMultiplier = 1.5;
            }
        }
        const baseDelta = isCorrect ? rewardRating : -getWrongAnswerPenalty(currentRating);
        const ratingDelta = isCorrect ? Math.round(baseDelta * feverMultiplier * dailyBonusMultiplier) : baseDelta;
        const finalRating = Math.max(0, currentRating + ratingDelta);
        await client.query('UPDATE users SET rating = $1 WHERE id = $2', [finalRating, userId]);
        const activityType = isCorrect ? 'correct_reward' : 'wrong_penalty';
        const dailyDescription = dailyBonusMultiplier > 1 ? ` (☀️첫 정답 1.5배)` : '';
        const activityDescription = isCorrect
            ? `정답 제출 보상 +${Math.round(rewardRating).toLocaleString()} RP${feverDescription}${dailyDescription}`
            : `오답 패널티 -${Math.abs(Math.round(ratingDelta)).toLocaleString()} RP`;
        await client.query(`INSERT INTO rating_activity_logs (
        user_id, problem_id, activity_type, change_amount, before_rating, after_rating, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            userId,
            problemId,
            activityType,
            Math.round(ratingDelta),
            currentRating,
            finalRating,
            activityDescription,
        ]);
        let streakResult = { newStreak: 0, bonusTokens: 0 };
        let finalTokens = 0;
        if (isCorrect) {
            streakResult = await (0, gameSystemService_1.updateStreak)(userId, client);
            finalTokens = await (0, gameSystemService_1.updateTokens)(userId, client, isCorrect);
            await (0, gameSystemService_1.updateQuests)(userId, client, 'solve', { isCorrect: true });
            await (0, gameSystemService_1.updateQuests)(userId, client, 'streak');
            const xpEarned = Math.round(rewardRating) / 100;
            await (0, gameSystemService_1.updateQuests)(userId, client, 'earn_xp', { xpEarned: Math.max(1, Math.floor(xpEarned)) });
            await (0, gameSystemService_1.updateQuests)(userId, client, 'solve', { isCorrect: true, consecutiveCorrect: streakResult.newStreak });
            await client.query('UPDATE users SET problems_solved = problems_solved + 1 WHERE id = $1', [userId]);
        }
        else {
            await (0, gameSystemService_1.updateQuests)(userId, client, 'attempt', { isCorrect: false });
            await (0, gameSystemService_1.updateQuests)(userId, client, 'solve', { isCorrect: false });
        }
        await client.query('INSERT INTO submissions (user_id, problem_id, is_correct) VALUES ($1, $2, $3)', [userId, problemId, isCorrect]);
        await client.query(`UPDATE problems SET 
        total_attempts = total_attempts + 1,
        correct_attempts = correct_attempts + $1
      WHERE id = $2`, [isCorrect ? 1 : 0, problemId]);
        const counterRes = await client.query('SELECT total_attempts, correct_attempts FROM problems WHERE id = $1', [problemId]);
        if (counterRes.rows.length > 0) {
            const { total_attempts, correct_attempts } = counterRes.rows[0];
            const solveRate = total_attempts > 0 ? correct_attempts / total_attempts : 0.5;
            const newDifficulty = (0, exports.calculateDifficultyFromSolveRate)(solveRate);
            await client.query('UPDATE problems SET current_difficulty = $1 WHERE id = $2', [newDifficulty, problemId]);
        }
        const finalUserRes = await client.query('SELECT streak, tokens, xp, quests, last_active_date, streak_repaired, longest_streak, problems_solved FROM users WHERE id = $1', [userId]);
        const finalUser = finalUserRes.rows[0];
        await client.query('COMMIT');
        const xp = finalUser.xp || 0;
        const level = Math.floor(Math.sqrt(xp / 100)) + 1;
        return {
            newUserRating: finalRating,
            tier: (0, exports.getTier)(finalRating),
            level,
            streak: finalUser.streak,
            tokens: finalUser.tokens,
            xp,
            quests: finalUser.quests,
            streakRepaired: repairResult.repaired,
            streakRepairedFlag: finalUser.streak_repaired,
            problems_solved: finalUser.problems_solved,
            feverActive,
            feverMultiplier
        };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
};
exports.processSubmission = processSubmission;
