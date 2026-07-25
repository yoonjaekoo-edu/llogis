import { describe, it, expect, beforeAll } from 'vitest';
import {
  getAllTemplates,
  getTemplateById,
  getTemplatesByUnit,
  getTemplatesByConcept,
  getUnits,
  getConcepts,
  generateRandomProblem,
  generateProblemById,
  generateProblems,
} from '../templateProblemGenerator.js';

describe('Template Problem Generator Service', () => {
  describe('getAllTemplates', () => {
    it('returns all 39 templates', () => {
      const templates = getAllTemplates();
      expect(templates.length).toBe(39);
    });

    it('each template has required fields', () => {
      const templates = getAllTemplates();
      for (const t of templates) {
        expect(t.id).toBeTruthy();
        expect(t.title).toBeTruthy();
        expect(typeof t.difficulty).toBe('number');
        expect(t.variables).toBeTruthy();
        expect(Array.isArray(t.constraints)).toBe(true);
        expect(t.problem_template).toBeTruthy();
        expect(t.answer_formula).toBeTruthy();
        expect(t.answer_formula.type).toBe('expression');
      }
    });

    it('no template has solution_template field', () => {
      const templates = getAllTemplates();
      for (const t of templates) {
        expect((t as any).solution_template).toBeUndefined();
      }
    });
  });

  describe('getTemplateById', () => {
    it('finds existing template', () => {
      const t = getTemplateById('MS-EQ1-001');
      expect(t).toBeTruthy();
      expect(t!.title).toBe('연속하는 세 자연수의 합');
    });

    it('returns undefined for missing id', () => {
      expect(getTemplateById('nonexistent')).toBeUndefined();
    });
  });

  describe('getTemplatesByUnit', () => {
    it('returns templates for known unit', () => {
      const templates = getTemplatesByUnit('도형');
      expect(templates.length).toBeGreaterThan(0);
      for (const t of templates) {
        expect(t.unit).toBe('도형');
      }
    });

    it('returns empty array for unknown unit', () => {
      expect(getTemplatesByUnit('unknown')).toEqual([]);
    });
  });

  describe('getUnits', () => {
    it('returns all unique units', () => {
      const units = getUnits();
      expect(units).toContain('일차방정식');
      expect(units).toContain('도형');
      expect(units).toContain('통계');
      expect(units).toContain('확률');
      expect(units.length).toBeGreaterThan(5);
    });
  });

  describe('getConcepts', () => {
    it('returns all unique concepts', () => {
      const concepts = getConcepts();
      expect(concepts).toContain('도형');
      expect(concepts).toContain('통계');
      expect(concepts).toContain('평균');
    });
  });

  describe('generateRandomProblem', () => {
    it('generates a valid problem', () => {
      const p = generateRandomProblem();
      expect(p.typeId).toBeTruthy();
      expect(p.title).toBeTruthy();
      expect(p.problem).toBeTruthy();
      expect(p.answer).toBeTruthy();
      expect(p.variables).toBeTruthy();
    });

    it('does not contain {{ placeholders in output', () => {
      const p = generateRandomProblem();
      expect(p.problem).not.toContain('{{');
      expect(p.problem).not.toContain('}}');
    });
  });

  describe('generateProblemById', () => {
    it('generates from specific template', () => {
      const p = generateProblemById('MS-EQ1-001')!;
      expect(p).toBeTruthy();
      expect(p.typeId).toBe('MS-EQ1-001');
      expect(p.title).toBe('연속하는 세 자연수의 합');
    });

    it('returns null for nonexistent id', () => {
      expect(generateProblemById('nonexistent')).toBeNull();
    });
  });

  describe('generateProblems', () => {
    it('generates by unit filter', () => {
      const problems = generateProblems({ unit: '도형', count: 3 });
      expect(problems.length).toBe(3);
    });

    it('generates by concept filter', () => {
      const problems = generateProblems({ concept: '평균', count: 2 });
      expect(problems.length).toBe(2);
    });

    it('throws for no matching templates', () => {
      expect(() =>
        generateProblems({ unit: '존재하지않는단원' }),
      ).toThrow('No templates match');
    });
  });

  describe('constraint satisfaction', () => {
    it('generates problems satisfying constraints', () => {
      for (let i = 0; i < 20; i++) {
        const p = generateProblemById('MS-EQ1-001')!;
        const S = p.variables.S as number;
        expect(S % 3).toBe(0);
        expect(S).toBeGreaterThanOrEqual(30);
        expect(S).toBeLessThanOrEqual(300);
        expect(p.answer).toBe(S / 3 + 1);
      }
    });

    it('handles age problem constraints', () => {
      for (let i = 0; i < 20; i++) {
        const p = generateProblemById('MS-EQ1-002')!;
        const ageDiff = p.variables.age_diff as number;
        const multiplier = p.variables.multiplier as number;
        expect(ageDiff % (multiplier - 1)).toBe(0);
      }
    });

    it('handles new geometry templates', () => {
      const p = generateRandomProblem();
      expect(typeof p.answer).toBe('number');
      expect(p.problem.length).toBeGreaterThan(0);
    });
  });
});
