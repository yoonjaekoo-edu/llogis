import type { VariableDef, GeneratedValues } from './types.js';

export function generateInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function generateChoice(
  choices: (string | number)[],
): string | number {
  return choices[Math.floor(Math.random() * choices.length)];
}

export function generateBoolean(): boolean {
  return Math.random() < 0.5;
}

export function generateVariable(def: VariableDef): number | boolean {
  switch (def.type) {
    case 'integer': {
      if (def.min === undefined || def.max === undefined) {
        throw new Error(
          `Variable of type 'integer' requires 'min' and 'max' fields`,
        );
      }
      return generateInteger(def.min, def.max);
    }
    case 'float': {
      if (def.min === undefined || def.max === undefined) {
        throw new Error(
          `Variable of type 'float' requires 'min' and 'max' fields`,
        );
      }
      return generateFloat(def.min, def.max);
    }
    case 'choice': {
      if (!def.choices || def.choices.length === 0) {
        throw new Error(
          `Variable of type 'choice' requires non-empty 'choices' array`,
        );
      }
      const val = generateChoice(def.choices);
      return typeof val === 'number' ? val : Number(val);
    }
    case 'boolean':
      return generateBoolean();
    default:
      throw new Error(
        `Unknown variable type: '${(def as VariableDef).type}'`,
      );
  }
}

export function generateAllVariables(
  variableDefs: Record<string, VariableDef>,
): GeneratedValues {
  const vars: GeneratedValues = {};
  for (const [name, def] of Object.entries(variableDefs)) {
    vars[name] = generateVariable(def);
  }
  return vars;
}
