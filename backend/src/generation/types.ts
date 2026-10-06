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
  /** 대분류(수와 연산 / 문자와 식 / 방정식과 부등식 / 함수 / 도형 / 확률과 통계) */
  domain?: string;
  /** 문제에 붙일 태그 후보(도메인 + 단원 + 개념) */
  tags?: string[];
}

export interface GeneratedValues {
  [key: string]: number | boolean;
}

export interface GeneratedProblem {
  typeId: string;
  title: string;
  /** 템플릿의 단원·도메인·태그. 문제 저장 시 함께 기록해 분야별 통계의 근거가 된다. */
  unit?: string;
  domain?: string;
  tags?: string[];
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
