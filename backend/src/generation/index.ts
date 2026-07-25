export { evaluateExpression, formatAnswerValue, clearParseCache } from './mathParser.js';
export { generateAllVariables, generateVariable } from './variableGenerator.js';
export { renderTemplate } from './templateEngine.js';
export { validateConstraints } from './constraintValidator.js';
export { generateProblem, generateProblems, batchGenerate, resetEngine } from './problemGenerator.js';
export type {
  VariableType,
  VariableDef,
  AnswerFormula,
  ProblemTemplateInput,
  GeneratedValues,
  GeneratedProblem,
  GenerationConfig,
} from './types.js';
export { DEFAULT_GENERATION_CONFIG } from './types.js';
