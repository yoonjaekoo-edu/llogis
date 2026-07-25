import { evaluateExpression, formatAnswerValue } from './mathParser.js';
import type { GeneratedValues } from './types.js';

const TEMPLATE_REGEX = /\{\{([^{}]+)\}\}/g;

export function renderTemplate(
  template: string,
  vars: GeneratedValues,
): string {
  return template.replace(TEMPLATE_REGEX, (_match, expr) => {
    const trimmed = expr.trim();
    const result = evaluateExpression(trimmed, vars);
    const formatted = formatAnswerValue(result);
    if (Array.isArray(formatted)) {
      return formatted.join(', ');
    }
    return String(formatted);
  });
}
