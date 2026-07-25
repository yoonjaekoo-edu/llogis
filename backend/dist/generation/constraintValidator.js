"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConstraints = validateConstraints;
const mathParser_js_1 = require("./mathParser.js");
function validateConstraints(constraints, vars) {
    for (const constraint of constraints) {
        const result = (0, mathParser_js_1.evaluateExpression)(constraint, vars);
        if (typeof result !== 'boolean' || !result) {
            return false;
        }
    }
    return true;
}
