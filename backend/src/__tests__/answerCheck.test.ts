import { describe, it, expect } from 'vitest';
import { checkAnswer } from '../grading/answerCheck.js';

describe('checkAnswer (제출·체험 공용 채점)', () => {
  it('공백과 대소문자를 무시하고 비교한다', () => {
    expect(checkAnswer(' 12 ', '12', '')).toBe(true);
    expect(checkAnswer('x=3', 'X = 3', '')).toBe(true);
    expect(checkAnswer('13', '12', '')).toBe(false);
  });

  it('수식이 같으면 표기가 달라도 정답으로 본다', () => {
    expect(checkAnswer('2+3', '5', '')).toBe(true);
    expect(checkAnswer('1/2', '0.5', '')).toBe(true);
    expect(checkAnswer('$7$', '7', '')).toBe(true);
    expect(checkAnswer('2+3', '6', '')).toBe(false);
  });

  it('비율 답은 앞 숫자만 본다 (4:1 → 4)', () => {
    expect(checkAnswer('4:1', '4', '')).toBe(true);
    expect(checkAnswer('4:1', '5', '')).toBe(false);
  });

  it('선택지 문제에서 A~D 한 글자는 선택지 텍스트로 바꿔 비교한다', () => {
    const content = '다음 중 옳은 것은?\nA. 12\nB. 13\nC. 14';
    expect(checkAnswer('A', '12', content)).toBe(true);
    expect(checkAnswer('c', '14', content)).toBe(true);
    expect(checkAnswer('B', '12', content)).toBe(false);
  });

  it('정답/입력이 비어 있어도 터지지 않는다', () => {
    expect(checkAnswer('', '', '')).toBe(true);
    expect(checkAnswer(undefined, null, undefined)).toBe(true);
    expect(checkAnswer('3', undefined, null)).toBe(false);
  });

  it('숫자가 아닌 문자 답은 문자열 비교로 처리한다', () => {
    expect(checkAnswer('2/5', '2/5', '')).toBe(true);
    expect(checkAnswer('2/5', '3/5', '')).toBe(false);
  });
});
