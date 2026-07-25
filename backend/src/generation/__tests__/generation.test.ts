import { describe, it, expect } from 'vitest';
import { evaluateExpression, formatAnswerValue, clearParseCache } from '../mathParser.js';
import { generateAllVariables, generateVariable } from '../variableGenerator.js';
import { renderTemplate } from '../templateEngine.js';
import { validateConstraints } from '../constraintValidator.js';
import { generateProblem, batchGenerate, resetEngine } from '../problemGenerator.js';
import type { ProblemTemplateInput, VariableDef } from '../types.js';

describe('Math Parser - Tokenizer & Evaluator', () => {
  it('evaluates simple integer arithmetic', () => {
    expect(evaluateExpression('3 + 5', {})).toBe(8);
    expect(evaluateExpression('10 - 4', {})).toBe(6);
    expect(evaluateExpression('3 * 7', {})).toBe(21);
    expect(evaluateExpression('15 / 3', {})).toBe(5);
    expect(evaluateExpression('2 ^ 3', {})).toBe(8);
    expect(evaluateExpression('10 % 3', {})).toBe(1);
  });

  it('evaluates operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4', {})).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4', {})).toBe(20);
    expect(evaluateExpression('10 - 2 * 3', {})).toBe(4);
    expect(evaluateExpression('2 * 3 ^ 2', {})).toBe(18);
    expect(evaluateExpression('(2 * 3) ^ 2', {})).toBe(36);
  });

  it('evaluates unary minus', () => {
    expect(evaluateExpression('-5', {})).toBe(-5);
    expect(evaluateExpression('-(3 + 2)', {})).toBe(-5);
    expect(evaluateExpression('--5', {})).toBe(5);
  });

  it('evaluates variable substitution', () => {
    expect(evaluateExpression('a + b', { a: 3, b: 7 })).toBe(10);
    expect(evaluateExpression('2 * x + 1', { x: 5 })).toBe(11);
    expect(evaluateExpression('S / 3 + 1', { S: 60 })).toBe(21);
  });

  it('evaluates comparison operators', () => {
    expect(evaluateExpression('5 == 5', {})).toBe(true);
    expect(evaluateExpression('5 == 3', {})).toBe(false);
    expect(evaluateExpression('5 != 3', {})).toBe(true);
    expect(evaluateExpression('5 < 3', {})).toBe(false);
    expect(evaluateExpression('3 < 5', {})).toBe(true);
    expect(evaluateExpression('5 <= 5', {})).toBe(true);
    expect(evaluateExpression('5 > 3', {})).toBe(true);
    expect(evaluateExpression('5 >= 6', {})).toBe(false);
  });

  it('evaluates logical operators', () => {
    expect(evaluateExpression('true || false', {})).toBe(true);
    expect(evaluateExpression('true && false', {})).toBe(false);
    expect(evaluateExpression('!true', {})).toBe(false);
    expect(evaluateExpression('!false', {})).toBe(true);
    expect(evaluateExpression('5 > 3 && 2 < 4', {})).toBe(true);
    expect(evaluateExpression('5 > 3 && 2 > 4', {})).toBe(false);
    expect(evaluateExpression('5 < 3 || 2 < 4', {})).toBe(true);
  });

  it('evaluates ternary operator', () => {
    expect(evaluateExpression('5 > 3 ? 10 : 20', {})).toBe(10);
    expect(evaluateExpression('5 < 3 ? 10 : 20', {})).toBe(20);
    expect(evaluateExpression('a <= 7 ? a - 1 : 13 - a', { a: 5 })).toBe(4);
    expect(evaluateExpression('a <= 7 ? a - 1 : 13 - a', { a: 10 })).toBe(3);
  });

  it('evaluates function calls', () => {
    expect(evaluateExpression('ceil(3.2)', {})).toBe(4);
    expect(evaluateExpression('floor(3.9)', {})).toBe(3);
    expect(evaluateExpression('abs(-5)', {})).toBe(5);
    expect(evaluateExpression('ceil((b + 5) / a) - 1', { a: 3, b: 10 })).toBe(
      4,
    );
  });

  it('evaluates list expressions', () => {
    expect(evaluateExpression('[3, a]', { a: 5 })).toEqual([3, 5]);
    expect(evaluateExpression('[1, 2, 3]', {})).toEqual([1, 2, 3]);
    expect(evaluateExpression('[a + b, a * b]', { a: 2, b: 3 })).toEqual([
      5, 6,
    ]);
  });

  it('evaluates modulo operator', () => {
    expect(evaluateExpression('10 % 3', {})).toBe(1);
    expect(evaluateExpression('S % 3 == 0', { S: 60 })).toBe(true);
    expect(evaluateExpression('S % 3 == 0', { S: 61 })).toBe(false);
  });

  it('handles floating point numbers', () => {
    const result = evaluateExpression('3.5 + 2.1', {});
    expect(result).toBeCloseTo(5.6);
  });

  it('throws on undefined variables', () => {
    expect(() => evaluateExpression('x + y', { x: 5 })).toThrow(
      'Undefined variable',
    );
  });

  it('throws on unexpected characters', () => {
    expect(() => evaluateExpression('3 @ 5', {})).toThrow(
      'Unexpected character',
    );
  });
});

describe('formatAnswerValue', () => {
  it('converts boolean to number', () => {
    expect(formatAnswerValue(true)).toBe(1);
    expect(formatAnswerValue(false)).toBe(0);
  });

  it('preserves integers', () => {
    expect(formatAnswerValue(42)).toBe(42);
    expect(formatAnswerValue(-7)).toBe(-7);
  });

  it('maps array values', () => {
    expect(formatAnswerValue([3, 5])).toEqual([3, 5]);
    expect(formatAnswerValue([1.5, 2.5])).toEqual([1.5, 2.5]);
  });

  it('cleans floating point drift', () => {
    expect(formatAnswerValue(50.00000000000001)).toBe(50);
  });
});

describe('Variable Generator', () => {
  it('generates integer within range', () => {
    const val = generateVariable({ type: 'integer', min: 5, max: 10 });
    expect(val).toBeGreaterThanOrEqual(5);
    expect(val).toBeLessThanOrEqual(10);
    expect(Number.isInteger(val)).toBe(true);
  });

  it('generates float within range', () => {
    const val = generateVariable({ type: 'float', min: 0, max: 1 });
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });

  it('generates choice from array', () => {
    const choices = [2, 4, 6, 8];
    const val = generateVariable({ type: 'choice', choices });
    expect(choices).toContain(val);
  });

  it('generates boolean', () => {
    const val = generateVariable({ type: 'boolean' });
    expect(typeof val === 'boolean').toBe(true);
  });

  it('throws for integer without range', () => {
    expect(() =>
      generateVariable({ type: 'integer' } as VariableDef),
    ).toThrow('requires');
  });

  it('throws for float without range', () => {
    expect(() =>
      generateVariable({ type: 'float' } as VariableDef),
    ).toThrow('requires');
  });

  it('throws for choice without choices', () => {
    expect(() =>
      generateVariable({ type: 'choice', choices: [] }),
    ).toThrow('requires');
  });

  it('generates all variables from defs', () => {
    const defs = {
      a: { type: 'integer' as const, min: 1, max: 10 },
      b: { type: 'choice' as const, choices: [1, 2, 3] },
      c: { type: 'boolean' as const },
    };
    const vars = generateAllVariables(defs);
    expect(vars).toHaveProperty('a');
    expect(vars).toHaveProperty('b');
    expect(vars).toHaveProperty('c');
    expect(typeof vars.a).toBe('number');
    expect(typeof vars.c).toBe('boolean');
  });
});

describe('Constraint Validator', () => {
  it('passes when all constraints are true', () => {
    expect(validateConstraints(['a > 0', 'b < 0'], { a: 5, b: -3 })).toBe(
      true,
    );
  });

  it('fails when a constraint is false', () => {
    expect(validateConstraints(['a > 0', 'a < 0'], { a: 5 })).toBe(false);
  });

  it('handles modulo constraints', () => {
    expect(validateConstraints(['S % 3 == 0'], { S: 60 })).toBe(true);
    expect(validateConstraints(['S % 3 == 0'], { S: 61 })).toBe(false);
  });

  it('passes empty constraints', () => {
    expect(validateConstraints([], { a: 5 })).toBe(true);
  });

  it('handles compound constraints', () => {
    expect(
      validateConstraints(
        ['a > 0', 'b < 0', 'a % 2 == 0'],
        { a: 4, b: -3 },
      ),
    ).toBe(true);
    expect(
      validateConstraints(
        ['a > 0', 'b < 0', 'a % 2 == 0'],
        { a: 3, b: -3 },
      ),
    ).toBe(false);
  });
});

describe('Template Engine', () => {
  it('replaces simple variable placeholders', () => {
    const result = renderTemplate('x = {{S}}', { S: 60 });
    expect(result).toBe('x = 60');
  });

  it('evaluates expressions in placeholders', () => {
    const result = renderTemplate('x = {{S/3}}', { S: 60 });
    expect(result).toBe('x = 20');
  });

  it('handles multiple placeholders', () => {
    const result = renderTemplate(
      '{{a}}x + {{b}} = {{c}}',
      { a: 2, b: 3, c: 11 },
    );
    expect(result).toBe('2x + 3 = 11');
  });

  it('preserves LaTeX formatting', () => {
    const result = renderTemplate(
      '$$x^2 - {{k}}x + a$$',
      { k: 6 },
    );
    expect(result).toBe('$$x^2 - 6x + a$$');
  });

  it('renders list answers as comma-separated', () => {
    const result = renderTemplate(
      '해는 {{answer}}',
      { answer: 0 },
    );
  });

  it('handles complex LaTeX with fractions', () => {
    const result = renderTemplate(
      '$\\frac{{{dist}}}{{{speed}}}$',
      { dist: 30, speed: 5 },
    );
    expect(result).toBe('$\\frac{30}{5}$');
  });
});

describe('Problem Generator - Full Pipeline', () => {
  const consecutiveSumTemplate: ProblemTemplateInput = {
    id: 'MS-EQ1-001',
    title: '연속하는 세 자연수의 합',
    difficulty: 12000,
    variables: {
      S: { type: 'integer', min: 30, max: 300 },
    },
    constraints: ['S % 3 == 0'],
    problem_template:
      '연속하는 세 자연수의 합이 {{S}}일 때, 이 중 가장 큰 수를 구하시오.',
    answer_formula: { type: 'expression', value: '(S / 3) + 1' },
    concepts: ['일차방정식의 활용', '연속하는 수'],
  };

  it('generates a valid problem from template', () => {
    const problem = generateProblem(consecutiveSumTemplate);
    expect(problem.typeId).toBe('MS-EQ1-001');
    expect(problem.title).toBe('연속하는 세 자연수의 합');
    expect(problem.difficulty).toBe(12000);
    expect(problem.variables).toHaveProperty('S');
    expect(typeof problem.answer).toBe('number');
    expect(problem.problem).toContain('연속하는 세 자연수의 합이');
    expect(problem.problem).toContain('일 때, 이 중 가장 큰 수를 구하시오.');
  });

  it('satisfies the constraint', () => {
    for (let i = 0; i < 10; i++) {
      const problem = generateProblem(consecutiveSumTemplate);
      const S = problem.variables.S as number;
      expect(S % 3).toBe(0);
      expect(S).toBeGreaterThanOrEqual(30);
      expect(S).toBeLessThanOrEqual(300);
    }
  });

  it('computes correct answer', () => {
    const problem = generateProblem(consecutiveSumTemplate);
    const S = problem.variables.S as number;
    const expected = S / 3 + 1;
    expect(problem.answer).toBe(expected);
  });

  const ageTemplate: ProblemTemplateInput = {
    id: 'MS-EQ1-002',
    title: '나이 문제',
    difficulty: 15000,
    variables: {
      age_diff: { type: 'integer', min: 24, max: 36 },
      multiplier: { type: 'integer', min: 3, max: 5 },
    },
    constraints: ['age_diff % (multiplier - 1) == 0'],
    problem_template:
      '현재 아버지의 나이는 아들의 나이보다 {{age_diff}}살 많고, 아버지의 나이가 아들의 나이의 {{multiplier}}배가 된다고 한다. 현재 아들의 나이를 구하시오.',
    answer_formula: {
      type: 'expression',
      value: 'age_diff / (multiplier - 1)',
    },
    concepts: ['일차방정식의 활용', '나이 계산'],
  };

  it('satisfies modulo constraint for age problem', () => {
    for (let i = 0; i < 20; i++) {
      const problem = generateProblem(ageTemplate);
      const ageDiff = problem.variables.age_diff as number;
      const multiplier = problem.variables.multiplier as number;
      expect(ageDiff % (multiplier - 1)).toBe(0);
    }
  });

  const quadraticTemplate: ProblemTemplateInput = {
    id: 'quadratic_001',
    title: '인수분해 활용',
    difficulty: 45000,
    variables: {
      a: { type: 'integer', min: 2, max: 20 },
    },
    constraints: [],
    problem_template:
      '$$x^2 - {{a+3}}x + 3a = 0$$ 의 해를 구하시오.',
    answer_formula: {
      type: 'expression',
      value: '[3, a]',
    },
    concepts: ['이차방정식'],
  };

  it('generates list answer for quadratic template', () => {
    const problem = generateProblem(quadraticTemplate);
    const a = problem.variables.a as number;
    expect(Array.isArray(problem.answer)).toBe(true);
    expect(problem.answer).toEqual([3, a]);
  });

  const concentrationTemplate: ProblemTemplateInput = {
    id: 'MS-CONC-001',
    title: '소금물의 농도와 물 증발',
    difficulty: 18000,
    variables: {
      initial_conc: { type: 'integer', min: 5, max: 10 },
      initial_water: { type: 'integer', min: 200, max: 500 },
      target_conc: { type: 'integer', min: 12, max: 20 },
    },
    constraints: [
      '(initial_conc * initial_water) % target_conc == 0',
      'target_conc > initial_conc',
    ],
    problem_template:
      '{{initial_conc}}\\%의 소금물 {{initial_water}}g이 있다. 이 소금물에서 물을 몇 g 증발시켜야 {{target_conc}}\\%의 소금물이 되는지 구하시오.',
    answer_formula: {
      type: 'expression',
      value: 'initial_water - (initial_conc * initial_water / target_conc)',
    },
    concepts: ['일차방정식의 활용', '농도'],
  };

  it('generates concentration problem satisfying constraints', () => {
    for (let i = 0; i < 10; i++) {
      const problem = generateProblem(concentrationTemplate);
      const ic = problem.variables.initial_conc as number;
      const iw = problem.variables.initial_water as number;
      const tc = problem.variables.target_conc as number;
      expect((ic * iw) % tc).toBe(0);
      expect(tc).toBeGreaterThan(ic);
    }
  });
});

describe('Problem Generator - Error Handling', () => {
  it('throws when constraints cannot be satisfied', () => {
    const impossibleTemplate: ProblemTemplateInput = {
      id: 'impossible',
      title: 'Impossible',
      difficulty: 1000,
      variables: {
        x: { type: 'integer', min: 1, max: 5 },
      },
      constraints: ['x > 10'],
      problem_template: 'x = {{x}}',
      answer_formula: { type: 'expression', value: 'x' },
    };
    expect(() => generateProblem(impossibleTemplate, { maxRetries: 5 })).toThrow(
      'Failed to generate',
    );
  });
});

describe('Batch Generation', () => {
  const template: ProblemTemplateInput = {
    id: 'batch_test',
    title: 'Batch Test',
    difficulty: 10000,
    variables: {
      x: { type: 'integer', min: 1, max: 100 },
    },
    constraints: [],
    problem_template: 'x = {{x}}',
    answer_formula: { type: 'expression', value: 'x' },
  };

  it('generates multiple problems', () => {
    const results = batchGenerate(template, 5);
    expect(results).toHaveLength(5);
  });

  it('generates unique values each time', () => {
    const results = batchGenerate(template, 50);
    const uniqueXValues = new Set(results.map((r) => r.variables.x as number));
    expect(uniqueXValues.size).toBeGreaterThan(1);
  });
});

describe('Cache Management', () => {
  it('resets parse cache without errors', () => {
    evaluateExpression('1 + 2', {});
    expect(() => clearParseCache()).not.toThrow();
    expect(() => resetEngine()).not.toThrow();
  });

  it('re-evaluates after cache clear', () => {
    evaluateExpression('a + b', { a: 1, b: 2 });
    clearParseCache();
    expect(evaluateExpression('a + b', { a: 3, b: 4 })).toBe(7);
  });
});

describe('Complex Expressions from Real Templates', () => {
  const realCases: { expr: string; vars: Record<string, number>; expected: number | boolean | number[] }[] = [
    { expr: '(S / 3) + 1', vars: { S: 60 }, expected: 21 },
    { expr: 'age_diff / (multiplier - 1)', vars: { age_diff: 30, multiplier: 4 }, expected: 10 },
    { expr: 'a - b', vars: { a: 10, b: -5 }, expected: 15 },
    { expr: 'initial_water - (initial_conc * initial_water / target_conc)', vars: { initial_conc: 8, initial_water: 300, target_conc: 15 }, expected: 140 },
    { expr: '(sum + diff) / 2', vars: { sum: 80, diff: 20 }, expected: 50 },
    { expr: 'ceil((b + 5) / a) - 1', vars: { a: 3, b: 10 }, expected: 4 },
    { expr: 'a * x + b', vars: { a: 3, x: 4, b: 5 }, expected: 17 },
    { expr: 'a + (a-1)', vars: { a: 50 }, expected: 99 },
    { expr: 'a + b', vars: { a: 5, b: 3 }, expected: 8 },
    { expr: 'dist', vars: { dist: 25 }, expected: 25 },
    { expr: '2 * a', vars: { a: 3 }, expected: 6 },
    { expr: 'y1 - m * x1', vars: { y1: 10, m: 3, x1: 2 }, expected: 4 },
    { expr: 'a * a', vars: { a: 6 }, expected: 36 },
    { expr: 'a * m * m + n', vars: { a: 2, m: 3, n: 4 }, expected: 22 },
    { expr: 'p + q', vars: { p: 3, q: -2 }, expected: 1 },
    { expr: '(a * b) / 2', vars: { a: 4, b: 6 }, expected: 12 },
    { expr: '(days_a * days_b) / (days_a + days_b)', vars: { days_a: 10, days_b: 15 }, expected: 6 },
    { expr: 'target <= 7 ? target - 1 : 13 - target', vars: { target: 5 }, expected: 4 },
    { expr: 'target <= 7 ? target - 1 : 13 - target', vars: { target: 10 }, expected: 3 },
    { expr: 'b + (b*b - 4)', vars: { b: 7 }, expected: 52 },
    { expr: 'n + 2', vars: { n: 5 }, expected: 7 },
    { expr: 'cost * (1 + rate / 100)', vars: { cost: 8000, rate: 20 }, expected: 9600 },
    { expr: 'sum_v / 2', vars: { sum_v: 30 }, expected: 15 },
    { expr: '(sum_v + diff_v) % 2 == 0', vars: { sum_v: 30, diff_v: 4 }, expected: true },
    { expr: 'n == 10 || n == 11 || n == 12', vars: { n: 11 }, expected: true },
    { expr: 'n == 10 || n == 11 || n == 12', vars: { n: 13 }, expected: false },
  ];

  realCases.forEach(({ expr, vars, expected }) => {
    it(`evaluates "${expr}" correctly`, () => {
      const result = evaluateExpression(expr, vars);
      if (typeof expected === 'number') {
        expect(result).toBe(expected);
      } else if (typeof expected === 'boolean') {
        expect(result).toBe(expected);
      } else {
        expect(result).toEqual(expected);
      }
    });
  });
});
