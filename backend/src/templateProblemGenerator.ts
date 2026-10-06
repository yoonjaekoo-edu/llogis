import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  generateProblem as engineGenerateProblem,
  generateProblems as engineGenerateProblems,
  batchGenerate,
  resetEngine,
} from './generation/index.js';
import type { ProblemTemplateInput, GeneratedProblem } from './generation/types.js';
import templatesJson from '../data/templates.json';

const TEMPLATES_PATH = join(__dirname, '..', 'data', 'templates.json');
const EXCLUDED_UNITS = new Set(['확률', '경우의 수']);

// 단원 → 대분류(프로필 다각형 그래프의 축). 새 템플릿에 domain을 안 적어도 여기서 채운다.
const DOMAIN_BY_UNIT: Record<string, string> = {
  '정수와 유리수': '수와 연산',
  '유리수와 순환소수': '수와 연산',
  '제곱근과 실수': '수와 연산',
  '소인수분해': '수와 연산',
  '최대공약수와 최소공배수': '수와 연산',
  '식의 계산': '문자와 식',
  '다항식': '문자와 식',
  '인수분해': '문자와 식',
  '비례식': '문자와 식',
  '수열': '문자와 식',
  '일차방정식': '방정식과 부등식',
  '연립방정식': '방정식과 부등식',
  '부등식': '방정식과 부등식',
  '방정식 활용': '방정식과 부등식',
  '농도 문제': '방정식과 부등식',
  '거리·속력·시간': '방정식과 부등식',
  '근의 공식 활용': '방정식과 부등식',
  '이차방정식': '방정식과 부등식',
  '일차함수': '함수',
  '이차함수': '함수',
  '좌표평면': '함수',
  '도형': '도형',
  '평면도형': '도형',
  '입체도형': '도형',
  '삼각형의 성질': '도형',
  '사각형의 성질': '도형',
  '원의 성질': '도형',
  '삼각비': '도형',
  '통계': '확률과 통계',
  '산포도': '확률과 통계',
  '확률': '확률과 통계',
  '경우의 수': '확률과 통계',
};

let templates: ProblemTemplateInput[] | null = null;
// 파일에 실제로 들어 있는 전체 목록(생성 풀에서 제외된 확률·경우의 수 포함).
// persistTemplates가 파일을 다시 쓸 때 이 순서와 제외 단원을 그대로 보존해야 한다.
let fileTemplates: ProblemTemplateInput[] = [];
// 마지막 로드 시 생성 풀에 있던 id. 파일에서 '삭제된' 템플릿과 '제외 단원이라 애초에 풀에 없는' 템플릿을 구분한다.
let poolIds: Set<string> = new Set();

const clampMassProducedRating = (value: number): number =>
  Math.round(Math.max(5000, Math.min(7000, value)) / 500) * 500;

function getDefaultRewardRatingByRank(rank: number, total: number): number {
  if (total <= 1) return 6000;
  return clampMassProducedRating(5000 + (rank * 2000) / (total - 1));
}

function normalizeTemplate(
  template: ProblemTemplateInput,
  defaultRewardRating?: number,
): ProblemTemplateInput {
  const fallback = defaultRewardRating ?? template.difficulty;
  const unit = template.unit ?? '';
  // domain·tags가 빠진 템플릿(관리자 패널에서 새로 만든 경우 등)도 항상 채워 둔다.
  const domain = template.domain ?? DOMAIN_BY_UNIT[unit] ?? '';
  const tags =
    Array.isArray(template.tags) && template.tags.length > 0
      ? template.tags
      : [domain, unit, ...(template.concepts ?? [])].filter((tag): tag is string => Boolean(tag));
  return {
    ...template,
    difficulty: clampMassProducedRating(Number(template.difficulty) || 6000),
    reward_rating: clampMassProducedRating(
      typeof template.reward_rating === 'number' ? template.reward_rating : fallback,
    ),
    domain,
    tags,
  };
}

function loadTemplates(): ProblemTemplateInput[] {
  if (!templates) {
    // Vercel(읽기 전용 파일시스템) 대비: 빌드 시점에 번들된 JSON을 우선 사용
    let parsed: ProblemTemplateInput[];
    if (process.env.VERCEL) {
      parsed = templatesJson as unknown as ProblemTemplateInput[];
    } else {
      const raw = readFileSync(TEMPLATES_PATH, 'utf-8');
      parsed = JSON.parse(raw) as ProblemTemplateInput[];
    }

    // 의도: 확률/경우의 수만 생성 풀에서 제외하고 나머지 템플릿은 모두 유지한다.
    fileTemplates = parsed;
    parsed = parsed.filter((template) => !EXCLUDED_UNITS.has(template.unit ?? ''));
    poolIds = new Set(parsed.map((template) => template.id));

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('templates.json is empty or invalid');
    }
    const ranked = parsed
      .map((template, index) => ({ template, index }))
      .sort((a, b) => {
        if (a.template.difficulty !== b.template.difficulty) {
          return a.template.difficulty - b.template.difficulty;
        }
        return a.index - b.index;
      });

    const defaultRewards = new Map<string, number>();
    ranked.forEach(({ template }, rank) => {
      if (typeof template.reward_rating !== 'number') {
        defaultRewards.set(template.id, getDefaultRewardRatingByRank(rank, ranked.length));
      }
    });

    templates = parsed.map((template) => normalizeTemplate(template, defaultRewards.get(template.id)));
  }
  return templates;
}

function persistTemplates(nextTemplates: ProblemTemplateInput[]): ProblemTemplateInput[] {
  templates = nextTemplates.map(normalizeTemplate);
  if (!process.env.VERCEL) {
    try {
      // 주의: templates는 생성 풀(확률·경우의 수 제외)이라 그대로 쓰면 파일에서 그 두 단원이 사라진다.
      // 파일에 있던 순서를 유지하면서 수정분만 갈아끼우고, 풀에 없는(제외된) 템플릿은 그대로 남긴다.
      const nextById = new Map(templates.map((t) => [t.id, t]));
      const fileIds = new Set(fileTemplates.map((t) => t.id));
      //  · 풀에 없던 항목(제외 단원)은 그대로 보존
      //  · 풀에 있었고 아직 있으면 수정본으로 교체
      //  · 풀에 있었는데 사라졌으면 삭제된 것이므로 파일에서도 제거
      const merged = fileTemplates
        .filter((t) => !poolIds.has(t.id) || nextById.has(t.id))
        .map((t) => nextById.get(t.id) ?? t);
      merged.push(...templates.filter((t) => !fileIds.has(t.id)));
      fileTemplates = merged;
      poolIds = new Set(templates.map((t) => t.id));
      writeFileSync(TEMPLATES_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf-8');
    } catch (e) {
      console.warn('Failed to persist templates to disk:', e);
    }
  }
  return templates;
}

export function reloadTemplates(): ProblemTemplateInput[] {
  templates = null;
  return loadTemplates();
}

export function getAllTemplates(): ProblemTemplateInput[] {
  return loadTemplates();
}

export function getTemplateById(id: string): ProblemTemplateInput | undefined {
  return loadTemplates().find((t) => t.id === id);
}

export function updateTemplateRewardRating(
  id: string,
  rewardRating: number,
): ProblemTemplateInput {
  const current = loadTemplates();
  const index = current.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new Error('Template not found');
  }

  const updated = [...current];
  updated[index] = {
    ...updated[index],
    reward_rating: rewardRating,
  };

  return persistTemplates(updated)[index];
}

export function updateTemplate(
  id: string,
  data: Partial<ProblemTemplateInput>,
): ProblemTemplateInput {
  const current = loadTemplates();
  const index = current.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new Error('Template not found');
  }

  const updated = [...current];
  updated[index] = {
    ...updated[index],
    ...data,
    id: updated[index].id,
  };

  return persistTemplates(updated)[index];
}

export function addTemplate(data: ProblemTemplateInput): ProblemTemplateInput {
  const current = loadTemplates();
  if (current.find((t) => t.id === data.id)) {
    throw new Error('Template ID already exists');
  }
  const updated = [...current, data];
  return persistTemplates(updated)[updated.length - 1];
}

export function deleteTemplate(id: string): void {
  const current = loadTemplates();
  const index = current.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new Error('Template not found');
  }
  const updated = [...current];
  updated.splice(index, 1);
  persistTemplates(updated);
}

export function getTemplatesByUnit(unit: string): ProblemTemplateInput[] {
  return loadTemplates().filter((t) => t.unit === unit);
}

export function getTemplatesByConcept(concept: string): ProblemTemplateInput[] {
  return loadTemplates().filter((t) => t.concepts?.includes(concept));
}

export function getUnits(): string[] {
  const units = new Set(loadTemplates().map((t) => t.unit).filter(Boolean));
  return [...units] as string[];
}

export function getConcepts(): string[] {
  const concepts = new Set(loadTemplates().flatMap((t) => t.concepts ?? []));
  return [...concepts];
}

export function generateRandomProblem(): GeneratedProblem {
  const pool = loadTemplates();
  const template = pool[Math.floor(Math.random() * pool.length)];
  return engineGenerateProblem(template);
}

export function generateProblemById(id: string): GeneratedProblem | null {
  const template = getTemplateById(id);
  if (!template) return null;
  return engineGenerateProblem(template);
}

export function generateProblems(
  filter?: { unit?: string; concept?: string; count?: number },
): GeneratedProblem[] {
  let pool = loadTemplates();
  if (filter?.unit) {
    pool = pool.filter((t) => t.unit === filter.unit);
  }
  if (filter?.concept) {
    pool = pool.filter((t) => t.concepts?.includes(filter.concept!));
  }
  if (pool.length === 0) {
    throw new Error('No templates match the given filter');
  }

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

export { batchGenerate, resetEngine };
