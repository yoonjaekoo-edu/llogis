import {
  evaluateExpression,
  formatAnswerValue,
  clearParseCache,
} from './mathParser.js';
import { generateAllVariables } from './variableGenerator.js';
import { renderTemplate } from './templateEngine.js';
import { validateConstraints } from './constraintValidator.js';
import {
  DEFAULT_GENERATION_CONFIG,
  type GeneratedProblem,
  type ProblemTemplateInput,
  type GenerationConfig,
} from './types.js';

export function generateProblem(
  template: ProblemTemplateInput,
  config?: Partial<GenerationConfig>,
): GeneratedProblem {
  const { maxRetries } = { ...DEFAULT_GENERATION_CONFIG, ...config };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const vars = generateAllVariables(template.variables);

    if (!validateConstraints(template.constraints, vars)) {
      continue;
    }

    const problem = renderTemplate(template.problem_template, vars);
    const rawAnswer = evaluateExpression(
      template.answer_formula.value,
      vars,
    );
    const answer = formatAnswerValue(rawAnswer);

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

  throw new Error(
    `Failed to generate valid variables after ${maxRetries} attempts for template "${template.id}"`,
  );
}

export function generateProblems(
  templates: ProblemTemplateInput[],
  config?: Partial<GenerationConfig>,
): GeneratedProblem[] {
  return templates.map((t) => generateProblem(t, config));
}

export function batchGenerate(
  template: ProblemTemplateInput,
  count: number,
  config?: Partial<GenerationConfig>,
): GeneratedProblem[] {
  const results: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    const gen = generateProblem(template, config);
    results.push(gen);
  }
  return results;
}

export function resetEngine(): void {
  clearParseCache();
}
