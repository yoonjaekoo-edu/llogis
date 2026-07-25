import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  generateProblem as engineGenerateProblem,
  generateProblems as engineGenerateProblems,
  batchGenerate,
  resetEngine,
} from './generation/index.js';
import type { ProblemTemplateInput, GeneratedProblem } from './generation/types.js';

const TEMPLATES_PATH = join(__dirname, '..', 'data', 'templates.json');

let templates: ProblemTemplateInput[] | null = null;

function getDefaultRewardRatingByRank(rank: number, total: number): number {
  if (total <= 1) return 5000;

  const ratio = rank / (total - 1);
  if (ratio < 1 / 3) {
    const t = ratio * 3;
    return Math.round(5000 + t * 5000);
  }
  if (ratio < 2 / 3) {
    const t = (ratio - 1 / 3) * 3;
    return Math.round(10000 + t * 4000);
  }
  const t = (ratio - 2 / 3) * 3;
  return Math.round(15000 + t * 5000);
}

function normalizeTemplate(
  template: ProblemTemplateInput,
  defaultRewardRating?: number,
): ProblemTemplateInput {
  return {
    ...template,
    reward_rating:
      typeof template.reward_rating === 'number'
        ? template.reward_rating
        : defaultRewardRating ?? template.difficulty,
  };
}

function loadTemplates(): ProblemTemplateInput[] {
  if (!templates) {
    const raw = readFileSync(TEMPLATES_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as ProblemTemplateInput[];
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
  writeFileSync(TEMPLATES_PATH, `${JSON.stringify(templates, null, 2)}\n`, 'utf-8');
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
