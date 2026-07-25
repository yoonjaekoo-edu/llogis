"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTemplate = renderTemplate;
const mathParser_js_1 = require("./mathParser.js");
const TEMPLATE_REGEX = /\{\{([^{}]+)\}\}/g;
function renderTemplate(template, vars) {
    return template.replace(TEMPLATE_REGEX, (_match, expr) => {
        const trimmed = expr.trim();
        const result = (0, mathParser_js_1.evaluateExpression)(trimmed, vars);
        const formatted = (0, mathParser_js_1.formatAnswerValue)(result);
        if (Array.isArray(formatted)) {
            return formatted.join(', ');
        }
        return String(formatted);
    });
}
