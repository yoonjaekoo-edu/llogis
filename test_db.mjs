import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ user: 'mathuser', host: 'localhost', database: 'math_solved', password: 'mathpass', port: 5432 });

async function test() {
  const seedCount = await pool.query('SELECT COUNT(*) FROM problems');
  console.log('Total problems:', seedCount.rows[0].count);
  
  const recent = await pool.query('SELECT id, title, is_custom FROM problems ORDER BY id DESC LIMIT 10');
  console.log('Recent problems:', JSON.stringify(recent.rows));
  
  const ins = await pool.query(
    'INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    ['Test Problem', 'Test content', '42', 50000, 50000, 'Calculation']
  );
  console.log('Inserted problem ID:', ins.rows[0].id);
  
  const afterInsert = await pool.query('SELECT id, title, is_custom FROM problems ORDER BY id DESC LIMIT 5');
  console.log('After insert:', JSON.stringify(afterInsert.rows));
  
  await pool.query('DELETE FROM problems WHERE id = $1', [ins.rows[0].id]);
  await pool.end();
  console.log('Done');
}
test().catch(e => { console.error(e); process.exit(1); });
