"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateProblem = generateProblem;
exports.generateProblems = generateProblems;
exports.batchGenerate = batchGenerate;
exports.resetEngine = resetEngine;
const mathParser_js_1 = require("./mathParser.js");
const variableGenerator_js_1 = require("./variableGenerator.js");
const templateEngine_js_1 = require("./templateEngine.js");
const constraintValidator_js_1 = require("./constraintValidator.js");
const types_js_1 = require("./types.js");
function generateProblem(template, config) {
    const { maxRetries } = { ...types_js_1.DEFAULT_GENERATION_CONFIG, ...config };
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const vars = (0, variableGenerator_js_1.generateAllVariables)(template.variables);
        if (!(0, constraintValidator_js_1.validateConstraints)(template.constraints, vars)) {
            continue;
        }
        const problem = (0, templateEngine_js_1.renderTemplate)(template.problem_template, vars);
        const rawAnswer = (0, mathParser_js_1.evaluateExpression)(template.answer_formula.value, vars);
        const answer = (0, mathParser_js_1.formatAnswerValue)(rawAnswer);
        return {
            typeId: template.id,
            title: template.title,
            difficulty: template.difficulty,
            rewardRating: template.reward_rating ?? template.difficulty,
            variables: vars,
            problem,
            answer,
        };
    }
    throw new Error(`Failed to generate valid variables after ${maxRetries} attempts for template "${template.id}"`);
}
function generateProblems(templates, config) {
    return templates.map((t) => generateProblem(t, config));
}
function batchGenerate(template, count, config) {
    const results = [];
    for (let i = 0; i < count; i++) {
        const gen = generateProblem(template, config);
        results.push(gen);
    }
    return results;
}
function resetEngine() {
    (0, mathParser_js_1.clearParseCache)();
}
