const fs = require('fs');
const path = require('path');

// Resolve path to templates.json relative to this script
const templatesPath = path.join(__dirname, 'data', 'templates.json');

const raw = fs.readFileSync(templatesPath, 'utf8');
let templates;
try {
  templates = JSON.parse(raw);
} catch (e) {
  console.error('Failed to parse templates.json:', e);
  process.exit(1);
}
if (!Array.isArray(templates)) {
  console.error('templates.json does not contain an array');
  process.exit(1);
}
const updated = templates.map(t => ({ ...t, difficulty: 50000 }));
fs.writeFileSync(templatesPath, JSON.stringify(updated, null, 2), 'utf8');
console.log('All template difficulties set to 50000');
