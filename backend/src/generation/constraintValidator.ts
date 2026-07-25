import { evaluateExpression } from './mathParser.js';
import type { GeneratedValues } from './types.js';

export function validateConstraints(
  constraints: string[],
  vars: GeneratedValues,
): boolean {
  for (const constraint of constraints) {
    const result = evaluateExpression(constraint, vars);
    if (typeof result !== 'boolean' || !result) {
      return false;
    }
  }
  return true;
}
