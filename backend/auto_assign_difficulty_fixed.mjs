// auto_assign_difficulty_fixed.mjs
import fs from 'fs';
import path from 'path';

// Correct path to templates.json inside backend/data
const templatesPath = path.resolve(__dirname, 'data', 'templates.json');
const raw = fs.readFileSync(templatesPath, 'utf-8');
let templates = JSON.parse(raw);

function assignDifficulty(template) {
  const unit = (template.unit || '').toLowerCase();
  const title = (template.title || '').toLowerCase();
  const varCount = template.variables ? Object.keys(template.variables).length : 0;
  const constraintCount = template.constraints ? template.constraints.length : 0;
  const highKeywords = ['미분','적분','복소','삼각','기하','통계','확률','대수학','방정식','함수','제곱근','로그'];
  const lowKeywords = ['기초','기본','정수','분수','초등','입문'];
  const isHigh = highKeywords.some(k=> unit.includes(k) || title.includes(k));
  const isLow = lowKeywords.some(k=> unit.includes(k) || title.includes(k));
  if (isHigh) return 80000;
  if (isLow && varCount<=2 && constraintCount===0) return 20000;
  if (varCount>=3 || constraintCount>=2) return 80000;
  return 50000;
}

templates = templates.map(t=> ({...t, difficulty: assignDifficulty(t)}));

fs.writeFileSync(templatesPath, JSON.stringify(templates, null, 2), 'utf-8');
console.log('Updated difficulty for', templates.length, 'templates');
