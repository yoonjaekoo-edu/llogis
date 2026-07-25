"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mathParser_js_1 = require("../mathParser.js");
const variableGenerator_js_1 = require("../variableGenerator.js");
const templateEngine_js_1 = require("../templateEngine.js");
const constraintValidator_js_1 = require("../constraintValidator.js");
const problemGenerator_js_1 = require("../problemGenerator.js");
(0, vitest_1.describe)('Math Parser - Tokenizer & Evaluator', () => {
    (0, vitest_1.it)('evaluates simple integer arithmetic', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('3 + 5', {})).toBe(8);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('10 - 4', {})).toBe(6);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('3 * 7', {})).toBe(21);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('15 / 3', {})).toBe(5);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('2 ^ 3', {})).toBe(8);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('10 % 3', {})).toBe(1);
    });
    (0, vitest_1.it)('evaluates operator precedence', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('2 + 3 * 4', {})).toBe(14);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('(2 + 3) * 4', {})).toBe(20);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('10 - 2 * 3', {})).toBe(4);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('2 * 3 ^ 2', {})).toBe(18);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('(2 * 3) ^ 2', {})).toBe(36);
    });
    (0, vitest_1.it)('evaluates unary minus', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('-5', {})).toBe(-5);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('-(3 + 2)', {})).toBe(-5);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('--5', {})).toBe(5);
    });
    (0, vitest_1.it)('evaluates variable substitution', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('a + b', { a: 3, b: 7 })).toBe(10);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('2 * x + 1', { x: 5 })).toBe(11);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('S / 3 + 1', { S: 60 })).toBe(21);
    });
    (0, vitest_1.it)('evaluates comparison operators', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 == 5', {})).toBe(true);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 == 3', {})).toBe(false);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 != 3', {})).toBe(true);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 < 3', {})).toBe(false);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('3 < 5', {})).toBe(true);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 <= 5', {})).toBe(true);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 > 3', {})).toBe(true);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 >= 6', {})).toBe(false);
    });
    (0, vitest_1.it)('evaluates logical operators', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('true || false', {})).toBe(true);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('true && false', {})).toBe(false);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('!true', {})).toBe(false);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('!false', {})).toBe(true);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 > 3 && 2 < 4', {})).toBe(true);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 > 3 && 2 > 4', {})).toBe(false);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 < 3 || 2 < 4', {})).toBe(true);
    });
    (0, vitest_1.it)('evaluates ternary operator', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 > 3 ? 10 : 20', {})).toBe(10);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('5 < 3 ? 10 : 20', {})).toBe(20);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('a <= 7 ? a - 1 : 13 - a', { a: 5 })).toBe(4);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('a <= 7 ? a - 1 : 13 - a', { a: 10 })).toBe(3);
    });
    (0, vitest_1.it)('evaluates function calls', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('ceil(3.2)', {})).toBe(4);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('floor(3.9)', {})).toBe(3);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('abs(-5)', {})).toBe(5);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('ceil((b + 5) / a) - 1', { a: 3, b: 10 })).toBe(4);
    });
    (0, vitest_1.it)('evaluates list expressions', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('[3, a]', { a: 5 })).toEqual([3, 5]);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('[1, 2, 3]', {})).toEqual([1, 2, 3]);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('[a + b, a * b]', { a: 2, b: 3 })).toEqual([
            5, 6,
        ]);
    });
    (0, vitest_1.it)('evaluates modulo operator', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('10 % 3', {})).toBe(1);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('S % 3 == 0', { S: 60 })).toBe(true);
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('S % 3 == 0', { S: 61 })).toBe(false);
    });
    (0, vitest_1.it)('handles floating point numbers', () => {
        const result = (0, mathParser_js_1.evaluateExpression)('3.5 + 2.1', {});
        (0, vitest_1.expect)(result).toBeCloseTo(5.6);
    });
    (0, vitest_1.it)('throws on undefined variables', () => {
        (0, vitest_1.expect)(() => (0, mathParser_js_1.evaluateExpression)('x + y', { x: 5 })).toThrow('Undefined variable');
    });
    (0, vitest_1.it)('throws on unexpected characters', () => {
        (0, vitest_1.expect)(() => (0, mathParser_js_1.evaluateExpression)('3 @ 5', {})).toThrow('Unexpected character');
    });
});
(0, vitest_1.describe)('formatAnswerValue', () => {
    (0, vitest_1.it)('converts boolean to number', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.formatAnswerValue)(true)).toBe(1);
        (0, vitest_1.expect)((0, mathParser_js_1.formatAnswerValue)(false)).toBe(0);
    });
    (0, vitest_1.it)('preserves integers', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.formatAnswerValue)(42)).toBe(42);
        (0, vitest_1.expect)((0, mathParser_js_1.formatAnswerValue)(-7)).toBe(-7);
    });
    (0, vitest_1.it)('maps array values', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.formatAnswerValue)([3, 5])).toEqual([3, 5]);
        (0, vitest_1.expect)((0, mathParser_js_1.formatAnswerValue)([1.5, 2.5])).toEqual([1.5, 2.5]);
    });
    (0, vitest_1.it)('cleans floating point drift', () => {
        (0, vitest_1.expect)((0, mathParser_js_1.formatAnswerValue)(50.00000000000001)).toBe(50);
    });
});
(0, vitest_1.describe)('Variable Generator', () => {
    (0, vitest_1.it)('generates integer within range', () => {
        const val = (0, variableGenerator_js_1.generateVariable)({ type: 'integer', min: 5, max: 10 });
        (0, vitest_1.expect)(val).toBeGreaterThanOrEqual(5);
        (0, vitest_1.expect)(val).toBeLessThanOrEqual(10);
        (0, vitest_1.expect)(Number.isInteger(val)).toBe(true);
    });
    (0, vitest_1.it)('generates float within range', () => {
        const val = (0, variableGenerator_js_1.generateVariable)({ type: 'float', min: 0, max: 1 });
        (0, vitest_1.expect)(val).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(val).toBeLessThanOrEqual(1);
    });
    (0, vitest_1.it)('generates choice from array', () => {
        const choices = [2, 4, 6, 8];
        const val = (0, variableGenerator_js_1.generateVariable)({ type: 'choice', choices });
        (0, vitest_1.expect)(choices).toContain(val);
    });
    (0, vitest_1.it)('generates boolean', () => {
        const val = (0, variableGenerator_js_1.generateVariable)({ type: 'boolean' });
        (0, vitest_1.expect)(typeof val === 'boolean').toBe(true);
    });
    (0, vitest_1.it)('throws for integer without range', () => {
        (0, vitest_1.expect)(() => (0, variableGenerator_js_1.generateVariable)({ type: 'integer' })).toThrow('requires');
    });
    (0, vitest_1.it)('throws for float without range', () => {
        (0, vitest_1.expect)(() => (0, variableGenerator_js_1.generateVariable)({ type: 'float' })).toThrow('requires');
    });
    (0, vitest_1.it)('throws for choice without choices', () => {
        (0, vitest_1.expect)(() => (0, variableGenerator_js_1.generateVariable)({ type: 'choice', choices: [] })).toThrow('requires');
    });
    (0, vitest_1.it)('generates all variables from defs', () => {
        const defs = {
            a: { type: 'integer', min: 1, max: 10 },
            b: { type: 'choice', choices: [1, 2, 3] },
            c: { type: 'boolean' },
        };
        const vars = (0, variableGenerator_js_1.generateAllVariables)(defs);
        (0, vitest_1.expect)(vars).toHaveProperty('a');
        (0, vitest_1.expect)(vars).toHaveProperty('b');
        (0, vitest_1.expect)(vars).toHaveProperty('c');
        (0, vitest_1.expect)(typeof vars.a).toBe('number');
        (0, vitest_1.expect)(typeof vars.c).toBe('boolean');
    });
});
(0, vitest_1.describe)('Constraint Validator', () => {
    (0, vitest_1.it)('passes when all constraints are true', () => {
        (0, vitest_1.expect)((0, constraintValidator_js_1.validateConstraints)(['a > 0', 'b < 0'], { a: 5, b: -3 })).toBe(true);
    });
    (0, vitest_1.it)('fails when a constraint is false', () => {
        (0, vitest_1.expect)((0, constraintValidator_js_1.validateConstraints)(['a > 0', 'a < 0'], { a: 5 })).toBe(false);
    });
    (0, vitest_1.it)('handles modulo constraints', () => {
        (0, vitest_1.expect)((0, constraintValidator_js_1.validateConstraints)(['S % 3 == 0'], { S: 60 })).toBe(true);
        (0, vitest_1.expect)((0, constraintValidator_js_1.validateConstraints)(['S % 3 == 0'], { S: 61 })).toBe(false);
    });
    (0, vitest_1.it)('passes empty constraints', () => {
        (0, vitest_1.expect)((0, constraintValidator_js_1.validateConstraints)([], { a: 5 })).toBe(true);
    });
    (0, vitest_1.it)('handles compound constraints', () => {
        (0, vitest_1.expect)((0, constraintValidator_js_1.validateConstraints)(['a > 0', 'b < 0', 'a % 2 == 0'], { a: 4, b: -3 })).toBe(true);
        (0, vitest_1.expect)((0, constraintValidator_js_1.validateConstraints)(['a > 0', 'b < 0', 'a % 2 == 0'], { a: 3, b: -3 })).toBe(false);
    });
});
(0, vitest_1.describe)('Template Engine', () => {
    (0, vitest_1.it)('replaces simple variable placeholders', () => {
        const result = (0, templateEngine_js_1.renderTemplate)('x = {{S}}', { S: 60 });
        (0, vitest_1.expect)(result).toBe('x = 60');
    });
    (0, vitest_1.it)('evaluates expressions in placeholders', () => {
        const result = (0, templateEngine_js_1.renderTemplate)('x = {{S/3}}', { S: 60 });
        (0, vitest_1.expect)(result).toBe('x = 20');
    });
    (0, vitest_1.it)('handles multiple placeholders', () => {
        const result = (0, templateEngine_js_1.renderTemplate)('{{a}}x + {{b}} = {{c}}', { a: 2, b: 3, c: 11 });
        (0, vitest_1.expect)(result).toBe('2x + 3 = 11');
    });
    (0, vitest_1.it)('preserves LaTeX formatting', () => {
        const result = (0, templateEngine_js_1.renderTemplate)('$$x^2 - {{k}}x + a$$', { k: 6 });
        (0, vitest_1.expect)(result).toBe('$$x^2 - 6x + a$$');
    });
    (0, vitest_1.it)('renders list answers as comma-separated', () => {
        const result = (0, templateEngine_js_1.renderTemplate)('해는 {{answer}}', { answer: 0 });
    });
    (0, vitest_1.it)('handles complex LaTeX with fractions', () => {
        const result = (0, templateEngine_js_1.renderTemplate)('$\\frac{{{dist}}}{{{speed}}}$', { dist: 30, speed: 5 });
        (0, vitest_1.expect)(result).toBe('$\\frac{30}{5}$');
    });
});
(0, vitest_1.describe)('Problem Generator - Full Pipeline', () => {
    const consecutiveSumTemplate = {
        id: 'MS-EQ1-001',
        title: '연속하는 세 자연수의 합',
        difficulty: 12000,
        variables: {
            S: { type: 'integer', min: 30, max: 300 },
        },
        constraints: ['S % 3 == 0'],
        problem_template: '연속하는 세 자연수의 합이 {{S}}일 때, 이 중 가장 큰 수를 구하시오.',
        answer_formula: { type: 'expression', value: '(S / 3) + 1' },
        concepts: ['일차방정식의 활용', '연속하는 수'],
    };
    (0, vitest_1.it)('generates a valid problem from template', () => {
        const problem = (0, problemGenerator_js_1.generateProblem)(consecutiveSumTemplate);
        (0, vitest_1.expect)(problem.typeId).toBe('MS-EQ1-001');
        (0, vitest_1.expect)(problem.title).toBe('연속하는 세 자연수의 합');
        (0, vitest_1.expect)(problem.difficulty).toBe(12000);
        (0, vitest_1.expect)(problem.variables).toHaveProperty('S');
        (0, vitest_1.expect)(typeof problem.answer).toBe('number');
        (0, vitest_1.expect)(problem.problem).toContain('연속하는 세 자연수의 합이');
        (0, vitest_1.expect)(problem.problem).toContain('일 때, 이 중 가장 큰 수를 구하시오.');
    });
    (0, vitest_1.it)('satisfies the constraint', () => {
        for (let i = 0; i < 10; i++) {
            const problem = (0, problemGenerator_js_1.generateProblem)(consecutiveSumTemplate);
            const S = problem.variables.S;
            (0, vitest_1.expect)(S % 3).toBe(0);
            (0, vitest_1.expect)(S).toBeGreaterThanOrEqual(30);
            (0, vitest_1.expect)(S).toBeLessThanOrEqual(300);
        }
    });
    (0, vitest_1.it)('computes correct answer', () => {
        const problem = (0, problemGenerator_js_1.generateProblem)(consecutiveSumTemplate);
        const S = problem.variables.S;
        const expected = S / 3 + 1;
        (0, vitest_1.expect)(problem.answer).toBe(expected);
    });
    const ageTemplate = {
        id: 'MS-EQ1-002',
        title: '나이 문제',
        difficulty: 15000,
        variables: {
            age_diff: { type: 'integer', min: 24, max: 36 },
            multiplier: { type: 'integer', min: 3, max: 5 },
        },
        constraints: ['age_diff % (multiplier - 1) == 0'],
        problem_template: '현재 아버지의 나이는 아들의 나이보다 {{age_diff}}살 많고, 아버지의 나이가 아들의 나이의 {{multiplier}}배가 된다고 한다. 현재 아들의 나이를 구하시오.',
        answer_formula: {
            type: 'expression',
            value: 'age_diff / (multiplier - 1)',
        },
        concepts: ['일차방정식의 활용', '나이 계산'],
    };
    (0, vitest_1.it)('satisfies modulo constraint for age problem', () => {
        for (let i = 0; i < 20; i++) {
            const problem = (0, problemGenerator_js_1.generateProblem)(ageTemplate);
            const ageDiff = problem.variables.age_diff;
            const multiplier = problem.variables.multiplier;
            (0, vitest_1.expect)(ageDiff % (multiplier - 1)).toBe(0);
        }
    });
    const quadraticTemplate = {
        id: 'quadratic_001',
        title: '인수분해 활용',
        difficulty: 45000,
        variables: {
            a: { type: 'integer', min: 2, max: 20 },
        },
        constraints: [],
        problem_template: '$$x^2 - {{a+3}}x + 3a = 0$$ 의 해를 구하시오.',
        answer_formula: {
            type: 'expression',
            value: '[3, a]',
        },
        concepts: ['이차방정식'],
    };
    (0, vitest_1.it)('generates list answer for quadratic template', () => {
        const problem = (0, problemGenerator_js_1.generateProblem)(quadraticTemplate);
        const a = problem.variables.a;
        (0, vitest_1.expect)(Array.isArray(problem.answer)).toBe(true);
        (0, vitest_1.expect)(problem.answer).toEqual([3, a]);
    });
    const concentrationTemplate = {
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
        problem_template: '{{initial_conc}}\\%의 소금물 {{initial_water}}g이 있다. 이 소금물에서 물을 몇 g 증발시켜야 {{target_conc}}\\%의 소금물이 되는지 구하시오.',
        answer_formula: {
            type: 'expression',
            value: 'initial_water - (initial_conc * initial_water / target_conc)',
        },
        concepts: ['일차방정식의 활용', '농도'],
    };
    (0, vitest_1.it)('generates concentration problem satisfying constraints', () => {
        for (let i = 0; i < 10; i++) {
            const problem = (0, problemGenerator_js_1.generateProblem)(concentrationTemplate);
            const ic = problem.variables.initial_conc;
            const iw = problem.variables.initial_water;
            const tc = problem.variables.target_conc;
            (0, vitest_1.expect)((ic * iw) % tc).toBe(0);
            (0, vitest_1.expect)(tc).toBeGreaterThan(ic);
        }
    });
});
(0, vitest_1.describe)('Problem Generator - Error Handling', () => {
    (0, vitest_1.it)('throws when constraints cannot be satisfied', () => {
        const impossibleTemplate = {
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
        (0, vitest_1.expect)(() => (0, problemGenerator_js_1.generateProblem)(impossibleTemplate, { maxRetries: 5 })).toThrow('Failed to generate');
    });
});
(0, vitest_1.describe)('Batch Generation', () => {
    const template = {
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
    (0, vitest_1.it)('generates multiple problems', () => {
        const results = (0, problemGenerator_js_1.batchGenerate)(template, 5);
        (0, vitest_1.expect)(results).toHaveLength(5);
    });
    (0, vitest_1.it)('generates unique values each time', () => {
        const results = (0, problemGenerator_js_1.batchGenerate)(template, 50);
        const uniqueXValues = new Set(results.map((r) => r.variables.x));
        (0, vitest_1.expect)(uniqueXValues.size).toBeGreaterThan(1);
    });
});
(0, vitest_1.describe)('Cache Management', () => {
    (0, vitest_1.it)('resets parse cache without errors', () => {
        (0, mathParser_js_1.evaluateExpression)('1 + 2', {});
        (0, vitest_1.expect)(() => (0, mathParser_js_1.clearParseCache)()).not.toThrow();
        (0, vitest_1.expect)(() => (0, problemGenerator_js_1.resetEngine)()).not.toThrow();
    });
    (0, vitest_1.it)('re-evaluates after cache clear', () => {
        (0, mathParser_js_1.evaluateExpression)('a + b', { a: 1, b: 2 });
        (0, mathParser_js_1.clearParseCache)();
        (0, vitest_1.expect)((0, mathParser_js_1.evaluateExpression)('a + b', { a: 3, b: 4 })).toBe(7);
    });
});
(0, vitest_1.describe)('Complex Expressions from Real Templates', () => {
    const realCases = [
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
        (0, vitest_1.it)(`evaluates "${expr}" correctly`, () => {
            const result = (0, mathParser_js_1.evaluateExpression)(expr, vars);
            if (typeof expected === 'number') {
                (0, vitest_1.expect)(result).toBe(expected);
            }
            else if (typeof expected === 'boolean') {
                (0, vitest_1.expect)(result).toBe(expected);
            }
            else {
                (0, vitest_1.expect)(result).toEqual(expected);
            }
        });
    });
});
