export type VariableType = 'integer' | 'float' | 'choice' | 'boolean';

export interface VariableDef {
  type: VariableType;
  min?: number;
  max?: number;
  choices?: (string | number)[];
}

export interface AnswerFormula {
  type: 'expression';
  value: string;
}

export interface ProblemTemplateInput {
  id: string;
  unit?: string;
  title: string;
  difficulty: number;
  reward_rating?: number;
  variables: Record<string, VariableDef>;
  constraints: string[];
  problem_template: string;
  answer_formula: AnswerFormula;
  concepts?: string[];
}

export interface GeneratedValues {
  [key: string]: number | boolean;
}

export interface GeneratedProblem {
  typeId: string;
  title: string;
  difficulty: number;
  rewardRating: number;
  variables: GeneratedValues;
  problem: string;
  answer: number | number[] | string;
}

export interface GenerationConfig {
  maxRetries: number;
}

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  maxRetries: 50,
};
