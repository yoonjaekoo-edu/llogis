"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const templateProblemGenerator_js_1 = require("../templateProblemGenerator.js");
(0, vitest_1.describe)('Template Problem Generator Service', () => {
    (0, vitest_1.describe)('getAllTemplates', () => {
        (0, vitest_1.it)('returns all 39 templates', () => {
            const templates = (0, templateProblemGenerator_js_1.getAllTemplates)();
            (0, vitest_1.expect)(templates.length).toBe(39);
        });
        (0, vitest_1.it)('each template has required fields', () => {
            const templates = (0, templateProblemGenerator_js_1.getAllTemplates)();
            for (const t of templates) {
                (0, vitest_1.expect)(t.id).toBeTruthy();
                (0, vitest_1.expect)(t.title).toBeTruthy();
                (0, vitest_1.expect)(typeof t.difficulty).toBe('number');
                (0, vitest_1.expect)(t.variables).toBeTruthy();
                (0, vitest_1.expect)(Array.isArray(t.constraints)).toBe(true);
                (0, vitest_1.expect)(t.problem_template).toBeTruthy();
                (0, vitest_1.expect)(t.answer_formula).toBeTruthy();
                (0, vitest_1.expect)(t.answer_formula.type).toBe('expression');
            }
        });
        (0, vitest_1.it)('no template has solution_template field', () => {
            const templates = (0, templateProblemGenerator_js_1.getAllTemplates)();
            for (const t of templates) {
                (0, vitest_1.expect)(t.solution_template).toBeUndefined();
            }
        });
    });
    (0, vitest_1.describe)('getTemplateById', () => {
        (0, vitest_1.it)('finds existing template', () => {
            const t = (0, templateProblemGenerator_js_1.getTemplateById)('MS-EQ1-001');
            (0, vitest_1.expect)(t).toBeTruthy();
            (0, vitest_1.expect)(t.title).toBe('연속하는 세 자연수의 합');
        });
        (0, vitest_1.it)('returns undefined for missing id', () => {
            (0, vitest_1.expect)((0, templateProblemGenerator_js_1.getTemplateById)('nonexistent')).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('getTemplatesByUnit', () => {
        (0, vitest_1.it)('returns templates for known unit', () => {
            const templates = (0, templateProblemGenerator_js_1.getTemplatesByUnit)('도형');
            (0, vitest_1.expect)(templates.length).toBeGreaterThan(0);
            for (const t of templates) {
                (0, vitest_1.expect)(t.unit).toBe('도형');
            }
        });
        (0, vitest_1.it)('returns empty array for unknown unit', () => {
            (0, vitest_1.expect)((0, templateProblemGenerator_js_1.getTemplatesByUnit)('unknown')).toEqual([]);
        });
    });
    (0, vitest_1.describe)('getUnits', () => {
        (0, vitest_1.it)('returns all unique units', () => {
            const units = (0, templateProblemGenerator_js_1.getUnits)();
            (0, vitest_1.expect)(units).toContain('일차방정식');
            (0, vitest_1.expect)(units).toContain('도형');
            (0, vitest_1.expect)(units).toContain('통계');
            (0, vitest_1.expect)(units).toContain('확률');
            (0, vitest_1.expect)(units.length).toBeGreaterThan(5);
        });
    });
    (0, vitest_1.describe)('getConcepts', () => {
        (0, vitest_1.it)('returns all unique concepts', () => {
            const concepts = (0, templateProblemGenerator_js_1.getConcepts)();
            (0, vitest_1.expect)(concepts).toContain('도형');
            (0, vitest_1.expect)(concepts).toContain('통계');
            (0, vitest_1.expect)(concepts).toContain('평균');
        });
    });
    (0, vitest_1.describe)('generateRandomProblem', () => {
        (0, vitest_1.it)('generates a valid problem', () => {
            const p = (0, templateProblemGenerator_js_1.generateRandomProblem)();
            (0, vitest_1.expect)(p.typeId).toBeTruthy();
            (0, vitest_1.expect)(p.title).toBeTruthy();
            (0, vitest_1.expect)(p.problem).toBeTruthy();
            (0, vitest_1.expect)(p.answer).toBeTruthy();
            (0, vitest_1.expect)(p.variables).toBeTruthy();
        });
        (0, vitest_1.it)('does not contain {{ placeholders in output', () => {
            const p = (0, templateProblemGenerator_js_1.generateRandomProblem)();
            (0, vitest_1.expect)(p.problem).not.toContain('{{');
            (0, vitest_1.expect)(p.problem).not.toContain('}}');
        });
    });
    (0, vitest_1.describe)('generateProblemById', () => {
        (0, vitest_1.it)('generates from specific template', () => {
            const p = (0, templateProblemGenerator_js_1.generateProblemById)('MS-EQ1-001');
            (0, vitest_1.expect)(p).toBeTruthy();
            (0, vitest_1.expect)(p.typeId).toBe('MS-EQ1-001');
            (0, vitest_1.expect)(p.title).toBe('연속하는 세 자연수의 합');
        });
        (0, vitest_1.it)('returns null for nonexistent id', () => {
            (0, vitest_1.expect)((0, templateProblemGenerator_js_1.generateProblemById)('nonexistent')).toBeNull();
        });
    });
    (0, vitest_1.describe)('generateProblems', () => {
        (0, vitest_1.it)('generates by unit filter', () => {
            const problems = (0, templateProblemGenerator_js_1.generateProblems)({ unit: '도형', count: 3 });
            (0, vitest_1.expect)(problems.length).toBe(3);
        });
        (0, vitest_1.it)('generates by concept filter', () => {
            const problems = (0, templateProblemGenerator_js_1.generateProblems)({ concept: '평균', count: 2 });
            (0, vitest_1.expect)(problems.length).toBe(2);
        });
        (0, vitest_1.it)('throws for no matching templates', () => {
            (0, vitest_1.expect)(() => (0, templateProblemGenerator_js_1.generateProblems)({ unit: '존재하지않는단원' })).toThrow('No templates match');
        });
    });
    (0, vitest_1.describe)('constraint satisfaction', () => {
        (0, vitest_1.it)('generates problems satisfying constraints', () => {
            for (let i = 0; i < 20; i++) {
                const p = (0, templateProblemGenerator_js_1.generateProblemById)('MS-EQ1-001');
                const S = p.variables.S;
                (0, vitest_1.expect)(S % 3).toBe(0);
                (0, vitest_1.expect)(S).toBeGreaterThanOrEqual(30);
                (0, vitest_1.expect)(S).toBeLessThanOrEqual(300);
                (0, vitest_1.expect)(p.answer).toBe(S / 3 + 1);
            }
        });
        (0, vitest_1.it)('handles age problem constraints', () => {
            for (let i = 0; i < 20; i++) {
                const p = (0, templateProblemGenerator_js_1.generateProblemById)('MS-EQ1-002');
                const ageDiff = p.variables.age_diff;
                const multiplier = p.variables.multiplier;
                (0, vitest_1.expect)(ageDiff % (multiplier - 1)).toBe(0);
            }
        });
        (0, vitest_1.it)('handles new geometry templates', () => {
            const p = (0, templateProblemGenerator_js_1.generateRandomProblem)();
            (0, vitest_1.expect)(typeof p.answer).toBe('number');
            (0, vitest_1.expect)(p.problem.length).toBeGreaterThan(0);
        });
    });
});
