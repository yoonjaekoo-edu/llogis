import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({
  user: process.env.DB_USER || 'mathuser',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'math_solved',
  password: process.env.DB_PASSWORD || 'mathpass',
  port: parseInt(process.env.DB_PORT || '5432'),
});

async function ensureTag(name: string): Promise<number> {
  const inserted = await pool.query(
    'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [name]
  );
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

      const result = await pool.query(
        `INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, is_custom, custom_reward_rating, reward_rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [title, problemContent, answer, 60000, 60000, 'Calculation', true, 60000, 60000]
      );

      await pool.query(
        'INSERT INTO problem_tags (problem_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [result.rows[0].id, tagId]
      );

      success++;
      if (success % 50 === 0) console.log(`${success}개 추가됨...`);
    } catch (err) {
      console.error(`라인 ${i + 1} 오류:`, (err as Error).message);
      errors++;
    }
  }

  console.log(`\n완료: ${success}개 성공, ${errors}개 실패`);
  await pool.end();
}

main();
