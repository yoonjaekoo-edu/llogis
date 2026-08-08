"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pool = new pg_1.Pool({
    user: process.env.DB_USER || 'mathuser',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'math_solved',
    password: process.env.DB_PASSWORD || 'mathpass',
    port: parseInt(process.env.DB_PORT || '5432'),
});
async function ensureTag(name) {
    const inserted = await pool.query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [name]);
    return inserted.rows[0].id;
}
async function main() {
    const filePath = path.join(__dirname, '../../ko_math-500.jsonl.txt');
    if (!fs.existsSync(filePath)) {
        console.error('파일을 찾을 수 없습니다:', filePath);
        process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    console.log(`총 ${lines.length}개 문제 발견`);
    const tagId = await ensureTag('ko_math-500');
    let success = 0;
    let errors = 0;
    for (let i = 0; i < lines.length; i++) {
        try {
            const data = JSON.parse(lines[i]);
            const title = data.subject || `수학 문제 #${i + 1}`;
            const problemContent = data.problem;
            const answer = data.answer;
            const result = await pool.query(`INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, is_custom, custom_reward_rating, reward_rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, [title, problemContent, answer, 60000, 60000, 'Calculation', true, 60000, 60000]);
            await pool.query('INSERT INTO problem_tags (problem_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [result.rows[0].id, tagId]);
            success++;
            if (success % 50 === 0)
                console.log(`${success}개 추가됨...`);
        }
        catch (err) {
            console.error(`라인 ${i + 1} 오류:`, err.message);
            errors++;
        }
    }
    console.log(`\n완료: ${success}개 성공, ${errors}개 실패`);
    await pool.end();
}
main();
