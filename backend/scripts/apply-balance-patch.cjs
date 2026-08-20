const fs = require('fs');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceOptional(source, before, after) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) return source;
  return source.replace(before, after);
}

function patchDifficulty() {
  const ratingPath = 'src/rating/ratingService.ts';
  let rating = fs.readFileSync(ratingPath, 'utf8');

  if (!rating.includes('const WRONG_DIFFICULTY_RATE = 0.01;')) {
    const helperAnchor = `export const calculateDifficultyFromSolveRate = (solveRate: number): number => {\n  if (solveRate < 0 || solveRate > 1 || isNaN(solveRate)) return 10000;\n  return Math.round(MAX_REWARD - (MAX_REWARD - MIN_REWARD) * solveRate);\n};`;
    const helperReplacement = `${helperAnchor}\n\n// Difficulty changes are deliberately gradual. Wrong answers make a problem\n// slightly harder/more rewarding, while correct answers slowly unwind only\n// the extra difficulty above the normal/custom baseline.\nconst WRONG_DIFFICULTY_RATE = 0.01;\nconst WRONG_DIFFICULTY_MIN_INCREASE = 100;\nconst WRONG_DIFFICULTY_MAX_INCREASE = 500;\nconst CORRECT_DIFFICULTY_DECAY_RATE = 0.0015;\nconst CORRECT_DIFFICULTY_MAX_DECREASE = 150;\n\nconst calculateNextDifficulty = (\n  currentDifficulty: number,\n  isCorrect: boolean,\n  isCustom: boolean\n): number => {\n  const baseline = getDefaultDifficulty(isCustom);\n  const current = Math.max(MIN_REWARD, Math.min(MAX_REWARD, currentDifficulty));\n\n  if (!isCorrect) {\n    const increase = Math.max(\n      WRONG_DIFFICULTY_MIN_INCREASE,\n      Math.min(WRONG_DIFFICULTY_MAX_INCREASE, Math.round(current * WRONG_DIFFICULTY_RATE))\n    );\n    return Math.min(MAX_REWARD, current + increase);\n  }\n\n  if (current <= baseline) return current;\n  const decrease = Math.max(\n    20,\n    Math.min(CORRECT_DIFFICULTY_MAX_DECREASE, Math.round(current * CORRECT_DIFFICULTY_DECAY_RATE))\n  );\n  return Math.max(baseline, current - decrease);\n};`;
    rating = replaceOnce(rating, helperAnchor, helperReplacement, 'difficulty helper');
  }

  const oldCalculation = `    const newDifficulty = calculateDifficultyFromSolveRate(\n      prob.total_attempts > 0 ? prob.correct_attempts / prob.total_attempts : 0.5\n    );`;
  const newCalculation = `    const difficultyBeforeAttempt = prob.current_difficulty != null\n      ? Number(prob.current_difficulty)\n      : getDefaultDifficulty(prob.is_custom);\n    const newDifficulty = calculateNextDifficulty(difficultyBeforeAttempt, isCorrect, prob.is_custom);`;
  rating = replaceOnce(rating, oldCalculation, newCalculation, 'submission difficulty update');

  fs.writeFileSync(ratingPath, rating, 'utf8');

  const indexPath = 'src/index.ts';
  let index = fs.readFileSync(indexPath, 'utf8');
  const oldSchemaRecalc = `  await pool.query(\`\n    UPDATE problems SET current_difficulty = \n      GREATEST(5000, LEAST(150000, ROUND(150000 - (150000 - 5000) * correct_attempts::float / NULLIF(total_attempts, 0))))\n    WHERE total_attempts > 0\n  \`);`;
  const newSchemaRecalc = `  // Difficulty is adjusted incrementally on each submission. Do not recompute\n  // every attempted problem from its lifetime solve rate on every deploy.\n  await pool.query(\`\n    UPDATE problems SET current_difficulty = CASE\n      WHEN current_difficulty IS NULL THEN CASE WHEN is_custom = TRUE THEN 60000 ELSE 10000 END\n      ELSE GREATEST(5000, LEAST(150000, current_difficulty))\n    END\n  \`);`;
  index = replaceOnce(index, oldSchemaRecalc, newSchemaRecalc, 'schema difficulty recalculation');

  fs.writeFileSync(indexPath, index, 'utf8');
}

function patchMarketVolatility() {
  const indexPath = 'src/index.ts';
  let index = fs.readFileSync(indexPath, 'utf8');

  // The market is injected by the root Doge/LogisCoin patch in Vercel builds.
  // Keep 15-second ticks, but reduce each random tick from ±1.75% to ±0.50%,
  // strengthen mean reversion, and reduce single-order market impact.
  index = replaceOptional(
    index,
    '      const randomMove = (random01 - 0.5) * 0.035;',
    '      const randomMove = (random01 - 0.5) * 0.010;'
  );
  index = replaceOptional(
    index,
    '      const meanReversion = ((20000 - price) / 20000) * 0.0025;',
    '      const meanReversion = ((20000 - price) / 20000) * 0.0040;'
  );
  index = replaceOptional(
    index,
    '    const impactMagnitude = Math.min(0.02, 0.00045 * Math.sqrt(quantity));',
    '    const impactMagnitude = Math.min(0.0075, 0.00010 * Math.sqrt(quantity));'
  );

  fs.writeFileSync(indexPath, index, 'utf8');
}

patchDifficulty();
patchMarketVolatility();
console.log('Logis balance patch applied successfully.');
