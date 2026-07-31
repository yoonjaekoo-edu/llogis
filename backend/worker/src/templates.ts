import templatesJson from '../../data/templates.json';
import {
  generateProblem as engineGenerateProblem,
  batchGenerate,
  generateProblems as engineGenerateProblems,
} from '../../src/generation/index.js';
import type { ProblemTemplateInput, GeneratedProblem } from '../../src/generation/types.js';

// Workers 에서는 fs 접근이 불가하므로 templates.json 을 JSON 모듈로 번들링한다.
// 기존 templateProblemGenerator.ts 의 fs 기반 영속화(persistTemplates)는
// R2/DB 로 대체해야 한다 (관리자 템플릿 CRUD 이관 시).
const templates = templatesJson as unknown as ProblemTemplateInput[];

export function getAllTemplates(): ProblemTemplateInput[] {
  return templates;
}

export function getTemplateById(id: string): ProblemTemplateInput | undefined {
  return templates.find((t) => t.id === id);
}

export function getUnits(): string[] {
  return [...new Set(templates.map((t) => t.unit).filter(Boolean))] as string[];
}

export function getConcepts(): string[] {
  return [...new Set(templates.flatMap((t) => t.concepts ?? []))];
}

export function generateProblemById(id: string): GeneratedProblem | null {
  const template = getTemplateById(id);
  if (!template) return null;
  return engineGenerateProblem(template);
}

export function generateRandomProblem(): GeneratedProblem {
  const template = templates[Math.floor(Math.random() * templates.length)];
  return engineGenerateProblem(template);
}

export function generateProblems(
  filter?: { unit?: string; concept?: string; count?: number },
): GeneratedProblem[] {
  let pool = templates;
  if (filter?.unit) pool = pool.filter((t) => t.unit === filter.unit);
  if (filter?.concept) pool = pool.filter((t) => t.concepts?.includes(filter.concept!));
  if (pool.length === 0) throw new Error('No templates match the given filter');

  const count = filter?.count ?? 1;
  if (count <= pool.length) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return engineGenerateProblems(shuffled.slice(0, count));
  }

  const results: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    const template = pool[Math.floor(Math.random() * pool.length)];
    results.push(engineGenerateProblem(template));
  }
  return results;
}

export { batchGenerate };
