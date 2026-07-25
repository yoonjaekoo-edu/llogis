"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDistribution = exports.updateConfig = exports.getConfig = exports.getTierFromRR = exports.calculateRR = exports.rrMixed = exports.rrInverse = exports.rrLog = exports.DEFAULT_CONFIG = exports.DEFAULT_TIERS = void 0;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    user: process.env.DB_USER || 'mathuser',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_NAME || 'math_solved',
    password: process.env.DB_PASSWORD || 'mathpass',
    port: parseInt(process.env.DB_PORT || '5432'),
});
exports.DEFAULT_TIERS = [
    { name: 'C', minRR: 0, color: '#636e72' },
    { name: 'B', minRR: 5000, color: '#e17055' },
    { name: 'A', minRR: 20000, color: '#00b894' },
    { name: 'A+', minRR: 40000, color: '#0984e3' },
    { name: 'S', minRR: 80000, color: '#6c5ce7' },
    { name: 'S+', minRR: 150000, color: '#fdcb6e' },
];
exports.DEFAULT_CONFIG = {
    param_a: 5000,
    param_b: 20000,
    param_k: 30000,
    function_type: 'log',
    tiers: exports.DEFAULT_TIERS,
};
const rrLog = (R, A, B, K) => Math.round(A + B * Math.log2(R / K + 1));
exports.rrLog = rrLog;
const rrInverse = (R, A, B, K) => Math.round(A + B * (R / (R + K)));
exports.rrInverse = rrInverse;
const rrMixed = (R, A, B, K) => Math.round(A + B * Math.log2(R / K + 1) * (R / (R + K)));
exports.rrMixed = rrMixed;
const calculateRR = (rating, config) => {
    const { param_a: A, param_b: B, param_k: K, function_type } = config;
    const R = Math.max(0, rating);
    switch (function_type) {
        case 'inverse': return (0, exports.rrInverse)(R, A, B, K);
        case 'mixed': return (0, exports.rrMixed)(R, A, B, K);
        default: return (0, exports.rrLog)(R, A, B, K);
    }
};
exports.calculateRR = calculateRR;
const getTierFromRR = (rr, config) => {
    const sorted = [...config.tiers].sort((a, b) => b.minRR - a.minRR);
    for (const tier of sorted) {
        if (rr >= tier.minRR)
            return tier;
    }
    return sorted[sorted.length - 1] || config.tiers[0];
};
exports.getTierFromRR = getTierFromRR;
const getConfig = async () => {
    const res = await pool.query('SELECT config FROM rating_config WHERE id = 1');
    if (res.rows.length === 0)
        return exports.DEFAULT_CONFIG;
    const c = res.rows[0].config;
    return {
        param_a: c.param_a ?? exports.DEFAULT_CONFIG.param_a,
        param_b: c.param_b ?? exports.DEFAULT_CONFIG.param_b,
        param_k: c.param_k ?? exports.DEFAULT_CONFIG.param_k,
        function_type: c.function_type ?? exports.DEFAULT_CONFIG.function_type,
        tiers: c.tiers ?? exports.DEFAULT_CONFIG.tiers,
    };
};
exports.getConfig = getConfig;
const updateConfig = async (partial) => {
    const current = await (0, exports.getConfig)();
    const updated = { ...current, ...partial };
    await pool.query(`INSERT INTO rating_config (id, config) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET config = $1::jsonb, updated_at = NOW()`, [JSON.stringify(updated)]);
    return updated;
};
exports.updateConfig = updateConfig;
const getDistribution = async (config) => {
    const users = await pool.query('SELECT rating FROM users');
    const counts = {};
    for (const t of config.tiers)
        counts[t.name] = 0;
    for (const row of users.rows) {
        const rr = (0, exports.calculateRR)(parseFloat(row.rating), config);
        const tier = (0, exports.getTierFromRR)(rr, config);
        counts[tier.name] = (counts[tier.name] || 0) + 1;
    }
    return config.tiers.map(t => ({ tier: t.name, count: counts[t.name] || 0, color: t.color }));
};
exports.getDistribution = getDistribution;
