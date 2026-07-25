"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInteger = generateInteger;
exports.generateFloat = generateFloat;
exports.generateChoice = generateChoice;
exports.generateBoolean = generateBoolean;
exports.generateVariable = generateVariable;
exports.generateAllVariables = generateAllVariables;
function generateInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function generateFloat(min, max) {
    return Math.random() * (max - min) + min;
}
function generateChoice(choices) {
    return choices[Math.floor(Math.random() * choices.length)];
}
function generateBoolean() {
    return Math.random() < 0.5;
}
function generateVariable(def) {
    switch (def.type) {
        case 'integer': {
            if (def.min === undefined || def.max === undefined) {
                throw new Error(`Variable of type 'integer' requires 'min' and 'max' fields`);
            }
            return generateInteger(def.min, def.max);
        }
        case 'float': {
            if (def.min === undefined || def.max === undefined) {
                throw new Error(`Variable of type 'float' requires 'min' and 'max' fields`);
            }
            return generateFloat(def.min, def.max);
        }
        case 'choice': {
            if (!def.choices || def.choices.length === 0) {
                throw new Error(`Variable of type 'choice' requires non-empty 'choices' array`);
            }
            const val = generateChoice(def.choices);
            return typeof val === 'number' ? val : Number(val);
        }
        case 'boolean':
            return generateBoolean();
        default:
            throw new Error(`Unknown variable type: '${def.type}'`);
    }
}
function generateAllVariables(variableDefs) {
    const vars = {};
    for (const [name, def] of Object.entries(variableDefs)) {
        vars[name] = generateVariable(def);
    }
    return vars;
}
