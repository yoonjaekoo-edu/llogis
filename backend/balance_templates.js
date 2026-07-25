import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Path to templates.json relative to this script location
const templatesPath = join(__dirname, '..', 'data', 'templates.json');

const raw = readFileSync(templatesPath, 'utf-8');
const templates = JSON.parse(raw);

if (!Array.isArray(templates)) {
  console.error('templates.json does not contain an array');
  process.exit(1);
}

const updated = templates.map(t => ({ ...t, difficulty: 50000 }));

writeFileSync(templatesPath, JSON.stringify(updated, null, 2), 'utf-8');
console.log('All template difficulties set to 50000');
