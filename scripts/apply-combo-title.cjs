const fs = require('fs');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  }
  return source.replace(before, after);
}

function patchBackend() {
  const path = 'backend/src/index.ts';
  let source = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');

  if (!source.includes("'one_shot_one_kill'")) {
    source = replaceOnce(
      source,
      "      ('token_hoarder', '토큰은 내 친구', '토큰 1000개 이상 보유', 'tokens', 1000),\n      ('xp_master', '경험치 중독자', 'XP 10000 이상 획득', 'xp', 10000)\n",
      "      ('token_hoarder', '토큰은 내 친구', '토큰 1000개 이상 보유', 'tokens', 1000),\n      ('xp_master', '경험치 중독자', 'XP 10000 이상 획득', 'xp', 10000),\n      ('one_shot_one_kill', '원샷원킬', '문제 20개를 연속으로 정답 맞히세요', 'consecutive_correct', 20)\n",
      'one-shot title seed'
    );
  }

  if (!source.includes('// Current consecutive-correct combo, calculated from trusted submission history.')) {
    source = replaceOnce(
      source,
      "    const correctCount = parseInt(statsRes.rows[0].count);\n\n    // Get ranking position (exclude admin)\n",
      "    const correctCount = parseInt(statsRes.rows[0].count);\n\n    // Current consecutive-correct combo, calculated from trusted submission history.\n    const recentComboSubmissionsRes = await client.query(\n      'SELECT is_correct FROM submissions WHERE user_id = $1 ORDER BY submitted_at DESC, id DESC LIMIT 100',\n      [userId]\n    );\n    let consecutiveCorrect = 0;\n    for (const row of recentComboSubmissionsRes.rows) {\n      if (!row.is_correct) break;\n      consecutiveCorrect++;\n    }\n\n    // Get ranking position (exclude admin)\n",
      'title combo calculation'
    );
  }

  if (!source.includes("case 'consecutive_correct':")) {
    source = replaceOnce(
      source,
      "        case 'xp':\n          if ((u.xp || 0) >= title.condition_value) shouldUnlock = true;\n          break;\n",
      "        case 'xp':\n          if ((u.xp || 0) >= title.condition_value) shouldUnlock = true;\n          break;\n        case 'consecutive_correct':\n          if (consecutiveCorrect >= title.condition_value) shouldUnlock = true;\n          break;\n",
      'consecutive title condition'
    );
  }

  if (!source.includes('rank: userRank, consecutiveCorrect')) {
    source = replaceOnce(
      source,
      "    res.json({ newlyUnlocked, correctCount, streak: user.streak, rank: userRank });\n",
      "    res.json({ newlyUnlocked, correctCount, streak: user.streak, rank: userRank, consecutiveCorrect });\n",
      'title check combo response'
    );
  }

  if (!source.includes('// Combo is authoritative on the server: count backwards until the first wrong answer.')) {
    source = replaceOnce(
      source,
      "    if ((updateResult as any).alreadySolved) {\n      return res.status(400).json({ error: 'Already solved this problem correctly!' });\n    }\n    if (process.env.LOG_SUBMISSION_PERF === '1') {\n",
      "    if ((updateResult as any).alreadySolved) {\n      return res.status(400).json({ error: 'Already solved this problem correctly!' });\n    }\n\n    // Combo is authoritative on the server: count backwards until the first wrong answer.\n    let consecutiveCorrect = 0;\n    let newlyUnlockedTitle: { title_id: string; name: string; description: string } | null = null;\n    if (isCorrect) {\n      const recentComboSubmissionsRes = await pool.query(\n        'SELECT is_correct FROM submissions WHERE user_id = $1 ORDER BY submitted_at DESC, id DESC LIMIT 100',\n        [userId]\n      );\n      for (const row of recentComboSubmissionsRes.rows) {\n        if (!row.is_correct) break;\n        consecutiveCorrect++;\n      }\n\n      if (consecutiveCorrect >= 20) {\n        const unlockRes = await pool.query(\n          `INSERT INTO user_titles (user_id, title_id)\n           SELECT $1, title_id FROM titles WHERE title_id = 'one_shot_one_kill'\n           ON CONFLICT (user_id, title_id) DO NOTHING\n           RETURNING title_id`,\n          [userId]\n        );\n        if (unlockRes.rowCount && unlockRes.rowCount > 0) {\n          const titleRes = await pool.query(\n            \"SELECT title_id, name, description FROM titles WHERE title_id = 'one_shot_one_kill'\"\n          );\n          newlyUnlockedTitle = titleRes.rows[0] || null;\n        }\n      }\n    }\n\n    if (process.env.LOG_SUBMISSION_PERF === '1') {\n",
      'submission combo calculation and unlock'
    );
  }

  if (!source.includes('newlyUnlockedTitle\n    });')) {
    source = replaceOnce(
      source,
      "    res.json({ \n      isCorrect,\n      ...updateResult \n    });\n",
      "    res.json({ \n      isCorrect,\n      ...updateResult,\n      consecutiveCorrect,\n      newlyUnlockedTitle\n    });\n",
      'submission combo response'
    );
  }

  fs.writeFileSync(path, source, 'utf8');
}

function patchFrontend() {
  const path = 'frontend/src/App.tsx';
  let source = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');

  if (!source.includes('const [comboCount, setComboCount]')) {
    source = replaceOnce(
      source,
      "  const [lastWrongAnswer, setLastWrongAnswer] = useState<{problemId: number} | null>(null);\n  const [lastCorrectFeedback, setLastCorrectFeedback] = useState<{rpGained: number} | null>(null);\n",
      "  const [lastWrongAnswer, setLastWrongAnswer] = useState<{problemId: number} | null>(null);\n  const [lastCorrectFeedback, setLastCorrectFeedback] = useState<{rpGained: number} | null>(null);\n  const [comboCount, setComboCount] = useState(0);\n  const [comboImpactKey, setComboImpactKey] = useState(0);\n  const [unlockedComboTitle, setUnlockedComboTitle] = useState<string | null>(null);\n",
      'combo UI state'
    );
  }

  if (!source.includes('const nextCombo = Math.max(1, Number(data.consecutiveCorrect) || 1);')) {
    source = replaceOnce(
      source,
      "      if (data.isCorrect) {\n        setShowFirework(true);\n        setLastWrongAnswer(null);\n        const rpGained = Math.round(data.newUserRating - user.rating);\n",
      "      if (data.isCorrect) {\n        setShowFirework(true);\n        setLastWrongAnswer(null);\n        const nextCombo = Math.max(1, Number(data.consecutiveCorrect) || 1);\n        setComboCount(nextCombo);\n        setComboImpactKey(prev => prev + 1);\n        if (data.newlyUnlockedTitle?.name) {\n          setUnlockedComboTitle(data.newlyUnlockedTitle.name);\n          setTimeout(() => setUnlockedComboTitle(null), 5000);\n        }\n        const rpGained = Math.round(data.newUserRating - user.rating);\n",
      'correct combo state update'
    );
  }

  if (!source.includes("      } else {\n        setComboCount(0);\n        setWrongGlowTrigger")) {
    source = replaceOnce(
      source,
      "      } else {\n        setWrongGlowTrigger(prev => prev + 1);\n        setLastWrongAnswer({ problemId });\n      }\n",
      "      } else {\n        setComboCount(0);\n        setWrongGlowTrigger(prev => prev + 1);\n        setLastWrongAnswer({ problemId });\n      }\n",
      'wrong answer combo reset'
    );
  }

  if (!source.includes('combo-wave-${comboImpactKey}')) {
    source = replaceOnce(
      source,
      "            <div className=\"math-content\" style={{ fontSize: '1.8rem' }}>{renderMath(selectedProblem.content)}</div>\n            {lastCorrectFeedback && (\n",
      "            <div className=\"math-content\" style={{ fontSize: '1.8rem' }}>{renderMath(selectedProblem.content)}</div>\n            {comboCount > 0 && (\n              <div aria-live=\"polite\" style={{ position: 'relative', height: '116px', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>\n                <motion.div\n                  key={`combo-wave-${comboImpactKey}`}\n                  initial={{ scale: 0.2, opacity: 0.85 }}\n                  animate={{ scale: 2.6, opacity: 0 }}\n                  transition={{ duration: 0.48, ease: 'easeOut' }}\n                  style={{ position: 'absolute', width: 64, height: 64, borderRadius: '50%', border: '5px solid #ffb000', pointerEvents: 'none' }}\n                />\n                <motion.div\n                  key={`combo-hit-${comboImpactKey}`}\n                  initial={{ opacity: 0, scale: 2.1, rotate: -9, y: -18 }}\n                  animate={{ opacity: [0, 1, 1, 0.78], scale: [2.1, 0.84, 1.08, 1], rotate: [-9, 4, -1, 0], y: [-18, -28, -31, -31] }}\n                  transition={{ duration: 0.52, times: [0, 0.24, 0.58, 1], ease: 'easeOut' }}\n                  style={{ position: 'absolute', top: 22, fontWeight: 1000, fontStyle: 'italic', letterSpacing: '0.12em', fontSize: '1.05rem', color: '#ff8a00', textShadow: '0 2px 0 #fff, 0 0 16px rgba(255,138,0,0.65)', transformOrigin: 'center', pointerEvents: 'none' }}\n                >\n                  {comboCount >= 20 ? 'CRITICAL HIT!' : comboCount >= 10 ? 'HEAVY HIT!' : 'HIT!'}\n                </motion.div>\n                <motion.div\n                  key={`combo-count-${comboImpactKey}`}\n                  initial={{ scale: 1.55, rotate: 3 }}\n                  animate={{ scale: [1.55, 0.92, 1.06, 1], rotate: [3, -2, 1, 0] }}\n                  transition={{ duration: 0.42, times: [0, 0.28, 0.65, 1], ease: 'easeOut' }}\n                  style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', padding: '1.25rem 1.6rem 0.65rem', borderRadius: '1rem', background: 'linear-gradient(135deg, rgba(255,176,0,0.14), rgba(255,90,0,0.08))', border: '1px solid rgba(255,138,0,0.28)', boxShadow: '0 10px 28px rgba(255,110,0,0.14)' }}\n                >\n                  <span style={{ fontSize: '2.4rem', lineHeight: 1, fontWeight: 1000, color: '#ff8a00', letterSpacing: '-0.08em' }}>{comboCount}</span>\n                  <span style={{ fontSize: '1rem', fontWeight: 1000, letterSpacing: '0.13em', color: 'var(--text-main)' }}>COMBO</span>\n                </motion.div>\n              </div>\n            )}\n            {unlockedComboTitle && (\n              <motion.div\n                initial={{ opacity: 0, y: 12, scale: 0.94 }}\n                animate={{ opacity: 1, y: 0, scale: 1 }}\n                style={{ marginTop: '0.5rem', padding: '0.85rem 1rem', borderRadius: '0.75rem', textAlign: 'center', fontWeight: 900, background: 'rgba(255, 176, 0, 0.12)', border: '1px solid rgba(255, 176, 0, 0.35)', color: '#e68a00' }}\n              >\n                🏆 새 칭호 획득 · {unlockedComboTitle}\n              </motion.div>\n            )}\n            {lastCorrectFeedback && (\n",
      'combo impact animation'
    );
  }

  fs.writeFileSync(path, source, 'utf8');
}

patchBackend();
patchFrontend();
console.log('Combo impact + one-shot title patch applied successfully.');
