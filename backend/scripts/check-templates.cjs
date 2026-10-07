#!/usr/bin/env node
/**
 * 템플릿 자체 점검: 생성 실패율 + 문제/정답 표기 이상.
 *
 *   npm run check:templates            # 템플릿당 300회
 *   npm run check:templates -- 1000    # 템플릿당 1000회
 *
 * 빌드된 dist/templateProblemGenerator.js를 쓴다(npm run build 먼저).
 * 생성 실패는 배치 생성을 통째로 죽이므로 하나라도 있으면 실패로 본다(exit 1).
 */
const path = require('path');
const gen = require(path.join(__dirname, '..', 'dist', 'templateProblemGenerator.js'));

const N = Math.max(20, parseInt(process.argv[2] || '300', 10));
const NOT_GENERATED_UNITS = ['확률', '경우의 수'];

const anomalies = {};
const note = (id, key, sample) => {
  anomalies[id] = anomalies[id] || { keys: {}, sample };
  anomalies[id].keys[key] = (anomalies[id].keys[key] || 0) + 1;
};

const halves = (t) => {
  // \frac{12}{3} 처럼 약분되는 분수는 중학 문제로 부적절하다.
  const m = t.match(/\\frac\{(\d+)\}\{(\d+)\}/);
  if (!m) return false;
  const n = Number(m[1]);
  const d = Number(m[2]);
  return d > 1 && n % d === 0;
};

function inspect(p) {
  const t = p.problem;
  const a = String(p.answer);
  if (/NaN|undefined|Infinity/.test(t) || /NaN|Infinity/.test(a)) return '결측값';
  if (/\+\s*-|-\s*-/.test(t)) return '이중 부호(+ -)';
  if (/[0-9]\.[0-9]{6,}/.test(t)) return '긴 소수 표기';
  if (/\$v_[a-z]|\$x_[0-9]|\bmultiplier\b|\binitial_\w+/.test(t)) return '변수 이름 노출';
  if (halves(t)) return '약분 가능한 분수';
  // \frac{A \pm \sqrt{B}}{2} 처럼 LaTeX 중괄호가 닫히는 것은 정상이므로, 짝이 맞는
  // 중괄호를 걷어낸 뒤에도 남는 중괄호가 있을 때만 '치환 안 된 placeholder'로 본다.
  let stripped = t;
  let prev;
  do { prev = stripped; stripped = stripped.replace(/\{[^{}]*\}/g, ''); } while (stripped !== prev);
  if (/\{\{|\}/.test(stripped)) return '치환 안 된 placeholder';
  if (!Number.isFinite(Number(a))) return '정답이 수치가 아님';
  return null;
}

const templates = gen.getAllTemplates();
console.log(`템플릿 ${templates.length}개 × ${N}회 생성 점검`);

const failures = [];
for (const template of templates) {
  if (NOT_GENERATED_UNITS.some((u) => template.unit.includes(u))) continue;
  let fail = 0;
  for (let i = 0; i < N; i++) {
    try {
      const p = gen.generateProblemById(template.id);
      if (!p) { fail++; continue; }
      const bad = inspect(p);
      if (bad) note(template.id, bad, p.problem);
    } catch (err) {
      fail++;
    }
  }
  if (fail) failures.push({ id: template.id, title: template.title, rate: (fail / N) * 100 });
}

console.log('\n[생성 실패] 변수 조건을 50회 안에 못 맞춘 경우 — 배치 생성이 통째로 죽는다');
if (failures.length === 0) console.log('  없음');
for (const f of failures.sort((a, b) => b.rate - a.rate)) {
  console.log(`  ${f.rate.toFixed(1)}%  [${f.id}] ${f.title}`);
}

console.log('\n[문제·정답 표기 이상]');
const ids = Object.keys(anomalies);
if (ids.length === 0) console.log('  없음');
for (const id of ids) {
  const { keys, sample } = anomalies[id];
  console.log(`  [${id}] ${JSON.stringify(keys)}`);
  console.log(`      예: ${sample.slice(0, 90)}`);
}

const problems = failures.length + ids.length;
console.log(`\n결과: 문제 있는 템플릿 ${problems}개 / ${templates.length}개`);
process.exit(problems ? 1 : 0);
