import fs from 'fs';
import path from 'path';

const templatesPath = path.resolve(__dirname, '..', 'data', 'templates.json');
const raw = fs.readFileSync(templatesPath, 'utf-8');
const templates = JSON.parse(raw);

function assignDifficulty(template) {
  const unit = (template.unit || '').toLowerCase();
  const varCount = template.variables ? Object.keys(template.variables).length : 0;
  const constraintCount = template.constraints ? template.constraints.length : 0;
  const highKeywords = ['미분', '적분', '복소', '기하', '통계', '연립', '함수', '제곱근', '로그'];
  const lowKeywords = ['기초', '기본', '정수', '분수', '덧셈', '뺄셈', '곱셈', '나눗셈'];
  if (highKeywords.some(k => unit.includes(k))) return 80000;
  if (lowKeywords.some(k => unit.includes(k))) return 20000;
  if (varCount >= 3 || constraintCount >= 2) return 80000;
  if (varCount <= 1 && constraintCount === 0) return 20000;
  return 50000;
}

for (const tmpl of templates) {
  tmpl.difficulty = assignDifficulty(tmpl);
}

fs.writeFileSync(templatesPath, JSON.stringify(templates, null, 2), 'utf-8');
console.log('Difficulty reassigned for', templates.length, 'templates');
