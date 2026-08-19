const fs = require('fs');

const path = 'backend/src/index.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  source = source.replace(before, after);
}

const oldDifficultyReset = `  await pool.query(\`\n    UPDATE problems SET current_difficulty = 60000\n    WHERE (total_attempts IS NULL OR total_attempts = 0) AND is_custom = TRUE\n  \`);`;
const newDifficultyReset = `  await pool.query(\`\n    UPDATE problems SET current_difficulty = GREATEST(5000, LEAST(150000, COALESCE(initial_difficulty, 60000)))\n    WHERE (total_attempts IS NULL OR total_attempts = 0) AND is_custom = TRUE\n  \`);`;

if (!source.includes('COALESCE(initial_difficulty, 60000)')) {
  replaceOnce(oldDifficultyReset, newDifficultyReset, 'custom difficulty preservation');
}

if (!source.includes('CURATED-CUSTOM-2026-08-19')) {
  const anchor = newDifficultyReset;
  const seed = `${newDifficultyReset}\n\n  // CURATED-CUSTOM-2026-08-19: hand-checked custom problems. Idempotent by title.\n  await pool.query(\`\n    INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, is_custom, custom_reward_rating, reward_rating)\n    SELECT v.title, v.content, v.answer, v.difficulty, v.difficulty, 'Calculation', TRUE, v.difficulty, v.difficulty\n    FROM (VALUES\n      ('[검수] 일차방정식 기본', '$3(x-2)+5=2x+11$을 만족하는 $x$의 값을 구하시오.', '12', 12000),\n      ('[검수] 등차수열 제12항', '첫째항이 $7$, 공차가 $3$인 등차수열의 제12항을 구하시오.', '40', 14000),\n      ('[검수] 세 자리 짝수의 개수', '숫자 $1,2,3,4$ 중 서로 다른 세 숫자를 사용하여 만들 수 있는 세 자리 자연수 중 짝수의 개수를 구하시오.', '12', 16000),\n      ('[검수] 연립방정식과 곱', '$x+y=17$, $x-y=5$일 때, $xy$의 값을 구하시오.', '66', 17000),\n      ('[검수] 직사각형의 넓이', '직사각형의 한 변의 길이가 $5$이고 대각선의 길이가 $13$일 때, 이 직사각형의 넓이를 구하시오.', '60', 18000),\n      ('[검수] 같은 색 공의 확률', '주머니에 빨간 공 3개와 파란 공 2개가 있다. 한 번에 2개의 공을 동시에 꺼낼 때, 두 공의 색이 같을 확률을 기약분수로 나타내시오.', '2/5', 20000),\n      ('[검수] 이차방정식 두 근의 제곱합', '이차방정식 $x^2-7x+12=0$의 두 근을 $\\alpha, \\beta$라 할 때, $\\alpha^2+\\beta^2$의 값을 구하시오.', '25', 22000),\n      ('[검수] 나머지 조건의 합', '200보다 작은 자연수 $n$ 중 $n$을 5로 나누면 나머지가 2이고, 7로 나누면 나머지가 4인 모든 $n$의 합을 구하시오.', '510', 24000)\n    ) AS v(title, content, answer, difficulty)\n    WHERE NOT EXISTS (SELECT 1 FROM problems p WHERE p.title = v.title);\n  \`);`;
  replaceOnce(anchor, seed, 'curated custom problem seed');
}

fs.writeFileSync(path, source, 'utf8');
console.log('Curated custom problems patch applied successfully.');
