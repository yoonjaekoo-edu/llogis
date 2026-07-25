import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const templatesPath = join(__dirname, '..', 'data', 'templates.json');
const raw = readFileSync(templatesPath, 'utf-8');
let templates = JSON.parse(raw);

function rangeSize(varDef) {
  if (varDef.min !== undefined && varDef.max !== undefined) {
    return varDef.max - varDef.min;
  }
  return 0;
}

for (const tmpl of templates) {
  const varEntries = Object.entries(tmpl.variables || {});
  const varCount = varEntries.length;
  const totalRange = varEntries.reduce((sum, [, def]) => sum + rangeSize(def), 0);
  const hasConstraints = tmpl.constraints && tmpl.constraints.length > 0;
  let difficulty = 50000; // default 중급
  if (varCount <= 1 && totalRange <= 3 && !hasConstraints) {
    difficulty = 20000; // 초급
  } else if (varCount <= 2 && totalRange <= 5 && !hasConstraints) {
    difficulty = 50000; // 중급
  } else {
    difficulty = 80000; // 고급
  }
  tmpl.difficulty = difficulty;
}

writeFileSync(templatesPath, JSON.stringify(templates, null, 2), 'utf-8');
console.log('Template difficulties updated based on heuristic.');
