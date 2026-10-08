import { evaluateExpression } from '../generation/mathParser.js';

/**
 * 제출한 답을 채점한다.
 *
 * 정식 제출(`POST /api/submissions`)과 익명 체험(`POST /api/trial/answer`)이 **같은 규칙**을 쓰도록
 * 한 곳에 모아 둔다 — 두 곳에 복사해 두면 한쪽만 고쳐져서 체험과 실제 채점이 갈린다.
 *
 * 규칙(순서대로 시도)
 * 1. 공백 전체 제거 + 소문자 비교
 * 2. 입력이 A~D 한 글자면 본문에서 그 선택지 텍스트를 뽑아 비교
 * 3. 둘 다 수식으로 평가되면 1e-9 이내 동등 비교 (`4:1` 같은 비율은 앞 숫자만)
 */
export const checkAnswer = (
  userAnswerRaw: unknown,
  correctAnswerRaw: unknown,
  problemContent: unknown
): boolean => {
  const userAnswer = typeof userAnswerRaw === 'string' ? userAnswerRaw : String(userAnswerRaw ?? '');
  const correctAnswer = typeof correctAnswerRaw === 'string' ? correctAnswerRaw : String(correctAnswerRaw ?? '');
  const content = typeof problemContent === 'string' ? problemContent : '';

  const normalizedUserAnswer = userAnswer.replace(/\s+/g, '').toLowerCase();
  const normalizedCorrectAnswer = correctAnswer.replace(/\s+/g, '').toLowerCase();
  let isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;

  // A/B/C/D 단일 문자 입력 처리: 선택지에서 해당 글자의 텍스트를 추출하여 정답과 비교
  if (!isCorrect && /^[a-dA-D]$/.test(userAnswer.trim())) {
    const letter = userAnswer.trim().toUpperCase();
    const optionMatch = content.match(new RegExp(`${letter}\\.\\s*([^\\n]+)`));
    if (optionMatch) {
      const optionText = optionMatch[1].trim().replace(/\s+/g, '').toLowerCase();
      isCorrect = optionText === normalizedCorrectAnswer || optionText === normalizedUserAnswer;
    }
  }

  // 수학적 동등성 평가 시도 (둘 다 숫자로 평가되면 1e-9 이내 비교)
  if (!isCorrect) {
    try {
      let cleanedUser = userAnswer.replace(/\$/g, '').trim();
      const cleanedCorrect = correctAnswer.replace(/\$/g, '').trim();
      // "4:1" 형태의 비율 입력 처리 → 첫 번째 숫자 추출
      const ratioMatch = cleanedUser.match(/^(\d+(?:\.\d+)?)\s*:\s*\d+(?:\.\d+)?$/);
      if (ratioMatch) {
        cleanedUser = ratioMatch[1];
      }
      const userVal = evaluateExpression(cleanedUser, {});
      const correctVal = evaluateExpression(cleanedCorrect, {});
      if (typeof userVal === 'number' && typeof correctVal === 'number') {
        isCorrect = Math.abs(userVal - correctVal) < 1e-9;
      }
    } catch {
      // 평가 실패 시 문자열 비교 결과 유지
    }
  }

  return isCorrect;
};
