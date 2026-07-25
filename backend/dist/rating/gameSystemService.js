"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateQuests = exports.updateTokens = exports.updateStreak = exports.handleDailyReset = exports.checkAndRepairStreak = exports.generateDailyQuests = exports.getTodayString = exports.getDaysDifference = void 0;
const getDaysDifference = (dateStr1, dateStr2) => {
    if (!dateStr1 || !dateStr2)
        return 999;
    const d1 = new Date(dateStr1);
    const d2 = new Date(dateStr2);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};
exports.getDaysDifference = getDaysDifference;
const getTodayString = () => {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    return kstDate.toISOString().split('T')[0];
};
exports.getTodayString = getTodayString;
const generateVariedQuests = () => {
    const pools = [
        [
            { id: 'solve_3', title: '수학 문제 3개 해결하기', type: 'solve', target: 3, current: 0, completed: false, xpReward: 150, tokenReward: 1 },
            { id: 'solve_5', title: '수학 문제 5개 해결하기', type: 'solve', target: 5, current: 0, completed: false, xpReward: 250, tokenReward: 2 },
            { id: 'solve_7', title: '수학 문제 7개 해결하기', type: 'solve', target: 7, current: 0, completed: false, xpReward: 350, tokenReward: 3 },
        ],
        [
            { id: 'maintain_streak', title: '오늘의 스트릭 시작/유지하기', type: 'streak', target: 1, current: 0, completed: false, xpReward: 100, tokenReward: 1 },
        ],
        [
            { id: 'accuracy_80', title: '정확도 80% 이상 달성하기 (최소 3문제)', type: 'accuracy', target: 80, current: 0, completed: false, xpReward: 200, tokenReward: 2, totalAttempts: 0, correctCount: 0 },
            { id: 'accuracy_90', title: '정확도 90% 이상 달성하기 (최소 5문제)', type: 'accuracy', target: 90, current: 0, completed: false, xpReward: 300, tokenReward: 3, totalAttempts: 0, correctCount: 0 },
        ],
        [
            { id: 'earn_xp_500', title: 'XP 500 획득하기', type: 'earn_xp', target: 500, current: 0, completed: false, xpReward: 100, tokenReward: 1 },
            { id: 'earn_xp_1000', title: 'XP 1000 획득하기', type: 'earn_xp', target: 1000, current: 0, completed: false, xpReward: 200, tokenReward: 2 },
        ],
        [
            { id: 'consecutive_3', title: '3연속 정답 달성하기', type: 'consecutive', target: 3, current: 0, completed: false, xpReward: 200, tokenReward: 2, consecutiveCount: 0 },
            { id: 'consecutive_5', title: '5연속 정답 달성하기', type: 'consecutive', target: 5, current: 0, completed: false, xpReward: 350, tokenReward: 3, consecutiveCount: 0 },
        ],
        [
            { id: 'perfect_round', title: '틀리지 않고 3문제 연속 풀기', type: 'perfect', target: 3, current: 0, completed: false, xpReward: 300, tokenReward: 3, consecutiveCount: 0 },
        ],
    ];
    const selected = [];
    const usedIndices = new Set();
    selected.push(pools[1][0]);
    const poolIndices = [0, 2, 3, 4, 5];
    const shuffled = poolIndices.sort(() => Math.random() - 0.5);
    for (let i = 0; i < 2 && i < shuffled.length; i++) {
        const pool = pools[shuffled[i]];
        const quest = pool[Math.floor(Math.random() * pool.length)];
        selected.push({ ...quest, current: 0, completed: false,
            ...(quest.totalAttempts !== undefined ? { totalAttempts: 0, correctCount: 0 } : {}),
            ...(quest.consecutiveCount !== undefined ? { consecutiveCount: 0 } : {}),
        });
    }
    return selected;
};
const generateDailyQuests = () => {
    return generateVariedQuests();
};
exports.generateDailyQuests = generateDailyQuests;
const checkAndRepairStreak = async (userId, client) => {
    const today = (0, exports.getTodayString)();
    const userRes = await client.query('SELECT streak, tokens, last_active_date, streak_repaired FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
        throw new Error('User not found');
    }
    const user = userRes.rows[0];
    let streak = user.streak || 0;
    let tokens = user.tokens || 0;
    const lastActive = user.last_active_date;
    let repaired = false;
    let consumedRepair = false;
    if (!lastActive) {
        return { repaired: false, newStreak: streak, newTokens: tokens, consumedRepair: false };
    }
    const diff = (0, exports.getDaysDifference)(lastActive, today);
    if (diff >= 2) {
        if (user.streak_repaired) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const kstOffset = 9 * 60 * 60 * 1000;
            const yesterdayKst = new Date(yesterday.getTime() + kstOffset);
            const yesterdayStr = yesterdayKst.toISOString().split('T')[0];
            await client.query('INSERT INTO submissions (user_id, problem_id, is_correct, is_streak_repair, user_answer) VALUES ($1, NULL, TRUE, TRUE, $2)', [userId, '스트릭 리페어 사용']);
            await client.query('UPDATE users SET streak_repaired = FALSE, last_active_date = $1 WHERE id = $2', [yesterdayStr, userId]);
            repaired = true;
            consumedRepair = true;
        }
        else {
            streak = 0;
            await client.query('UPDATE users SET streak = $1, last_active_date = $2 WHERE id = $3', [streak, today, userId]);
        }
    }
    return { repaired, newStreak: streak, newTokens: tokens, consumedRepair };
};
exports.checkAndRepairStreak = checkAndRepairStreak;
const handleDailyReset = async (userId, client, todayStr) => {
    const today = todayStr || (0, exports.getTodayString)();
    const userRes = await client.query('SELECT last_active_date, streak_repaired, quests FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0)
        return;
    const user = userRes.rows[0];
    const lastActive = user.last_active_date;
    if (lastActive !== today) {
        const freshQuests = (0, exports.generateDailyQuests)();
        await client.query('UPDATE users SET quests = $1 WHERE id = $2', [JSON.stringify(freshQuests), userId]);
    }
};
exports.handleDailyReset = handleDailyReset;
const updateStreak = async (userId, client) => {
    const today = (0, exports.getTodayString)();
    const userRes = await client.query('SELECT streak, last_active_date, tokens, longest_streak FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0)
        throw new Error('User not found');
    const user = userRes.rows[0];
    let streak = user.streak || 0;
    let longestStreak = user.longest_streak || 0;
    const lastActive = user.last_active_date;
    let bonusTokens = 0;
    if (lastActive !== today) {
        const diff = (0, exports.getDaysDifference)(lastActive, today);
        if (diff === 1 || lastActive === '') {
            streak += 1;
        }
        else {
            streak = 1;
        }
        if (streak > longestStreak)
            longestStreak = streak;
        if (streak >= 30) {
            bonusTokens = 5;
        }
        else if (streak >= 10) {
            bonusTokens = 3;
        }
        else if (streak >= 5) {
            bonusTokens = 1;
        }
        await client.query('UPDATE users SET streak = $1, last_active_date = $2, tokens = tokens + $3, longest_streak = $4 WHERE id = $5', [streak, today, bonusTokens, longestStreak, userId]);
    }
    return { newStreak: streak, bonusTokens };
};
exports.updateStreak = updateStreak;
const updateTokens = async (userId, client, isCorrect) => {
    if (!isCorrect) {
        const userRes = await client.query('SELECT tokens FROM users WHERE id = $1', [userId]);
        return userRes.rows[0]?.tokens || 0;
    }
    const result = await client.query('UPDATE users SET tokens = tokens + 1 WHERE id = $1 RETURNING tokens', [userId]);
    return result.rows[0]?.tokens || 0;
};
exports.updateTokens = updateTokens;
const updateQuests = async (userId, client, action, data) => {
    const userRes = await client.query('SELECT quests, xp, tokens FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0)
        throw new Error('User not found');
    const user = userRes.rows[0];
    let quests = Array.isArray(user.quests) ? user.quests : [];
    if (quests.length === 0) {
        quests = (0, exports.generateDailyQuests)();
    }
    let xpGained = 0;
    let tokensGained = 0;
    quests = quests.map((q) => {
        if (q.completed)
            return q;
        let updatedQ = { ...q };
        if (q.type === 'solve' && action === 'solve') {
            updatedQ.current += 1;
            if (updatedQ.current >= updatedQ.target) {
                updatedQ.completed = true;
                xpGained += updatedQ.xpReward;
                tokensGained += updatedQ.tokenReward;
            }
        }
        else if (q.type === 'streak' && action === 'streak') {
            updatedQ.current = 1;
            updatedQ.completed = true;
            xpGained += updatedQ.xpReward;
            tokensGained += updatedQ.tokenReward;
        }
        else if (q.type === 'accuracy' && (action === 'attempt' || action === 'solve')) {
            if (action === 'solve' && data?.isCorrect === false) {
                return updatedQ;
            }
            const total = (q.totalAttempts || 0) + 1;
            const corrects = (q.correctCount || 0) + (action === 'solve' && data?.isCorrect ? 1 : 0);
            updatedQ.totalAttempts = total;
            updatedQ.correctCount = corrects;
            const accuracy = total >= q.target ? Math.round((corrects / total) * 100) : 0;
            updatedQ.current = accuracy;
            if (total >= 3 && accuracy >= q.target) {
                updatedQ.completed = true;
                xpGained += updatedQ.xpReward;
                tokensGained += updatedQ.tokenReward;
            }
        }
        else if (q.type === 'earn_xp' && action === 'earn_xp' && data?.xpEarned) {
            updatedQ.current += data.xpEarned;
            if (updatedQ.current >= updatedQ.target) {
                updatedQ.completed = true;
                xpGained += updatedQ.xpReward;
                tokensGained += updatedQ.tokenReward;
            }
        }
        else if (q.type === 'consecutive' && action === 'solve') {
            if (data?.isCorrect) {
                const cc = (q.consecutiveCount || 0) + 1;
                updatedQ.consecutiveCount = cc;
                updatedQ.current = cc;
                if (cc >= q.target) {
                    updatedQ.completed = true;
                    xpGained += updatedQ.xpReward;
                    tokensGained += updatedQ.tokenReward;
                }
            }
            else {
                updatedQ.consecutiveCount = 0;
                updatedQ.current = 0;
            }
        }
        else if (q.type === 'perfect' && action === 'solve') {
            if (data?.isCorrect) {
                const cc = (q.consecutiveCount || 0) + 1;
                updatedQ.consecutiveCount = cc;
                updatedQ.current = cc;
                if (cc >= q.target) {
                    updatedQ.completed = true;
                    xpGained += updatedQ.xpReward;
                    tokensGained += updatedQ.tokenReward;
                }
            }
            else {
                updatedQ.consecutiveCount = 0;
                updatedQ.current = 0;
            }
        }
        return updatedQ;
    });
    if (xpGained > 0 || tokensGained > 0) {
        await client.query('UPDATE users SET xp = xp + $1, tokens = tokens + $2, quests = $3 WHERE id = $4', [xpGained, tokensGained, JSON.stringify(quests), userId]);
    }
    else {
        await client.query('UPDATE users SET quests = $1 WHERE id = $2', [JSON.stringify(quests), userId]);
    }
    return { quests, xpGained, tokensGained };
};
exports.updateQuests = updateQuests;
