/**
 * 수식 입력 전용 키보드의 순수 로직.
 *
 * DOM·React와 분리해 두는 이유: 커서 위치 계산·`$...$` 자동 감싸기·LaTeX 명령 통째 삭제 같은
 * 규칙은 눈으로 확인할 수 없고, 키패드를 만질 때마다 조용히 깨진다. 여기 있는 함수는
 * 값과 선택 영역만 받아서 새 값과 커서를 돌려주므로 그대로 테스트할 수 있다.
 */

export type KeyKind = 'char' | 'latex';

export interface KeySpec {
  /** 버튼에 보이는 글자 */
  label: string;
  /** 실제로 삽입되는 문자열 */
  insert: string;
  /** 삽입 시작점 기준 커서 오프셋 (기본: 삽입 문자열 끝) */
  caret?: number;
  /** `다음 칸` 키로 이동할 지점들(삽입 시작점 기준). 예: `\frac{}{}` → 분자, 분모 */
  stops?: number[];
  /** `latex`면 커서가 수식 밖일 때 `$...$`로 감싸서 넣는다 */
  kind?: KeyKind;
  /** 버튼 title(데스크톱 툴팁) */
  title?: string;
}

export const key = (label: string, insert: string, extra: Partial<KeySpec> = {}): KeySpec =>
  ({ label, insert, ...extra });

export const mathKey = (label: string, insert: string, extra: Partial<KeySpec> = {}): KeySpec =>
  ({ label, insert, kind: 'latex', ...extra });

export interface KeyGroup {
  id: string;
  label: string;
  keys: KeySpec[];
}

const DIGITS: KeySpec[] = [
  key('7', '7'), key('8', '8'), key('9', '9'),
  key('4', '4'), key('5', '5'), key('6', '6'),
  key('1', '1'), key('2', '2'), key('3', '3'),
  key('0', '0'),
];

/** 문제 내용·해설용 (LaTeX) — `kind: 'latex'`는 수식 밖에서 누르면 `$...$`로 감싼다. */
export const LATEX_GROUPS: KeyGroup[] = [
  {
    id: 'basic',
    label: '기본',
    keys: [
      key('x', 'x'), key('y', 'y'), key('a', 'a'), key('b', 'b'),
      key('+', '+'), key('−', '-'), key('=', '='), key(',', ','), key('.', '.'),
      key('%', '\\% ', { kind: 'latex' }),
      key('×', '\\times ', { kind: 'latex' }),
      key('÷', '\\div ', { kind: 'latex' }),
      key('≠', '\\ne ', { kind: 'latex' }),
      key('(', '('), key(')', ')'),
      ...DIGITS,
    ],
  },
  {
    id: 'fraction',
    label: '분수·거듭제곱',
    keys: [
      mathKey('분수', '\\frac{}{}', { caret: 6, stops: [6, 8], title: '\\frac{분자}{분모}' }),
      mathKey('√', '\\sqrt{}', { caret: 6, title: '\\sqrt{ }' }),
      mathKey('∛', '\\sqrt[3]{}', { caret: 6, stops: [6, 9], title: '\\sqrt[3]{ }' }),
      mathKey('xⁿ', '^{}', { caret: 2, title: '지수 ( ^{ } )' }),
      mathKey('xₙ', '_{}', { caret: 2, title: '아래첨자 ( _{ } )' }),
      mathKey('( )', '\\left(\\right)', { caret: 6, stops: [6, 12], title: '\\left( \\right)' }),
      mathKey('[ ]', '\\left[\\right]', { caret: 6, stops: [6, 12] }),
      mathKey('|x|', '\\left|\\right|', { caret: 6, stops: [6, 12] }),
      mathKey('{ }', '\\left\\{\\right\\}', { caret: 7, stops: [7, 15] }),
      mathKey('%', '\\% '),
      mathKey('⋯', '\\cdots '),
      mathKey('·', '\\cdot '),
      mathKey('±', '\\pm '),
      mathKey('∞', '\\infty '),
      mathKey('≈', '\\approx '),
      mathKey('∴', '\\therefore '),
      mathKey('∵', '\\because '),
    ],
  },
  {
    id: 'function',
    label: '함수',
    keys: [
      mathKey('sin', '\\sin '), mathKey('cos', '\\cos '), mathKey('tan', '\\tan '),
      mathKey('log', '\\log '), mathKey('ln', '\\ln '),
      mathKey('lim', '\\lim_{x \\to 0}', { caret: 6, stops: [6, 13], title: '\\lim_{x \\to 0}' }),
      mathKey('Σ', '\\sum_{}^{}', { caret: 7, stops: [7, 9], title: '\\sum_{ }^{ }' }),
      mathKey('∫', '\\int_{}^{}', { caret: 7, stops: [7, 9], title: '\\int_{ }^{ }' }),
      mathKey('∏', '\\prod_{}^{}', { caret: 7, stops: [7, 9] }),
      mathKey('nCr', '\\binom{}{}', { caret: 6, stops: [6, 8], title: '\\binom{n}{r}' }),
      mathKey('x̄', '\\overline{}', { caret: 10 }),
      mathKey('x⃗', '\\vec{}', { caret: 5 }),
      mathKey('ẋ', '\\dot{}', { caret: 5 }),
      mathKey('!', '!'),
      mathKey('gcd', '\\gcd '), mathKey('mod', '\\bmod '),
    ],
  },
  {
    id: 'symbol',
    label: '기호',
    keys: [
      mathKey('≤', '\\le '), mathKey('≥', '\\ge '), mathKey('≠', '\\ne '),
      mathKey('≈', '\\approx '), mathKey('±', '\\pm '), mathKey('∞', '\\infty '),
      mathKey('°', '^\\circ', { caret: 0, title: '도( ° )' }),
      mathKey('∠', '\\angle '), mathKey('△', '\\triangle '),
      mathKey('□', '\\square '), mathKey('○', '\\bigcirc '),
      mathKey('∥', '\\parallel '), mathKey('⊥', '\\perp '),
      mathKey('⇒', '\\Rightarrow '), mathKey('⇔', '\\iff '),
      mathKey('→', '\\to '), mathKey('↦', '\\mapsto '),
      mathKey('∴', '\\therefore '), mathKey('∵', '\\because '),
      mathKey('△=', '\\triangleq '),
    ],
  },
  {
    id: 'greek',
    label: '그리스',
    keys: [
      mathKey('α', '\\alpha '), mathKey('β', '\\beta '), mathKey('γ', '\\gamma '),
      mathKey('δ', '\\delta '), mathKey('ε', '\\varepsilon '), mathKey('θ', '\\theta '),
      mathKey('λ', '\\lambda '), mathKey('μ', '\\mu '), mathKey('π', '\\pi '),
      mathKey('ρ', '\\rho '), mathKey('σ', '\\sigma '), mathKey('τ', '\\tau '),
      mathKey('φ', '\\varphi '), mathKey('ω', '\\omega '), mathKey('ψ', '\\psi '),
      mathKey('Δ', '\\Delta '), mathKey('Σ', '\\Sigma '), mathKey('Π', '\\Pi '),
      mathKey('Ω', '\\Omega '), mathKey('Φ', '\\Phi '), mathKey('Ψ', '\\Psi '),
    ],
  },
  {
    id: 'set',
    label: '집합',
    keys: [
      mathKey('∈', '\\in '), mathKey('∉', '\\notin '),
      mathKey('⊂', '\\subset '), mathKey('⊃', '\\supset '),
      mathKey('⊆', '\\subseteq '), mathKey('⊇', '\\supseteq '),
      mathKey('∪', '\\cup '), mathKey('∩', '\\cap '),
      mathKey('∅', '\\varnothing '), mathKey('∀', '\\forall '), mathKey('∃', '\\exists '),
      mathKey('ℝ', '\\mathbb{R} '), mathKey('ℤ', '\\mathbb{Z} '),
      mathKey('ℚ', '\\mathbb{Q} '), mathKey('ℕ', '\\mathbb{N} '),
      mathKey('{', '\\{ '), mathKey('}', '\\} '),
    ],
  },
  {
    id: 'syntax',
    label: '수식 구문',
    keys: [
      key('$ … $', '$$', { caret: 1, title: '인라인 수식 감싸기' }),
      key('$$ … $$', '$$$$', { caret: 2, title: '블록 수식 감싸기' }),
      key('줄바꿈', '\n', { title: '본문 줄바꿈' }),
      key('+ −', '\\pm ', { kind: 'latex' }),
    ],
  },
];

/** 정답 입력용 — 채점기는 안전한 사칙연산 파서(`evaluateExpression`)로 비교한다. LaTeX가 아니라 ASCII 수식을 넣는다. */
export const PLAIN_GROUPS: KeyGroup[] = [
  {
    id: 'plain',
    label: '정답 입력',
    keys: [
      key('7', '7'), key('8', '8'), key('9', '9'),
      key('/', '/', { title: '분수 (예: 2/5)' }),
      key('^', '^', { title: '거듭제곱 (예: 3^2)' }),
      key(':', ':', { title: '비율 (예: 4:1 — 앞 숫자로 채점)' }),
      key('4', '4'), key('5', '5'), key('6', '6'),
      key('*', '*', { title: '곱셈' }),
      key('(', '('), key(') ', ')'),
      key('1', '1'), key('2', '2'), key('3', '3'),
      key('-', '-'), key('+', '+'), key('.', '.'),
      key('0', '0'), key(',', ','),
      key('=', '='),
      key('√', 'sqrt(', { title: 'sqrt( ) — 제곱근' }),
      key('π', 'pi', { title: '원주율' }),
      key('%', '%', { title: '나머지 (예: 7%3)' }),
      key('abs(', 'abs(', { title: '절댓값' }),
    ],
  },
];

/** 커서가 `$...$` 또는 `$$...$$` 안에 있는지 */
export const isInsideMath = (value: string, pos: number): boolean => {
  const limit = Math.max(0, Math.min(pos, value.length));
  let i = 0;
  let inline = false;
  let block = false;
  while (i < limit) {
    if (value[i] === '$') {
      if (value[i + 1] === '$') {
        if (block) block = false;
        else if (!inline) block = true;
        i += 2;
        continue;
      }
      if (!block) inline = !inline;
    }
    i += 1;
  }
  return inline || block;
};

export interface Selection {
  start: number;
  end: number;
}

export interface InsertOptions {
  /** 수식 밖에서 LaTeX 키를 누르면 `$...$`로 감쌀지 */
  autoWrap?: boolean;
  maxLength?: number;
}

export interface EditResult {
  value: string;
  caret: number;
  stops: number[];
}

/** 키 하나를 삽입한 결과. 글자 수 제한을 넘으면 null. */
export const applyInsert = (
  value: string,
  sel: Selection,
  spec: KeySpec,
  options: InsertOptions = {}
): EditResult | null => {
  const raw = spec.insert ?? '';
  if (!raw) return null;
  const start = Math.max(0, Math.min(sel.start, value.length));
  const end = Math.max(start, Math.min(sel.end, value.length));
  const wrap = !!options.autoWrap && spec.kind === 'latex' && !isInsideMath(value, start);
  const text = wrap ? `$${raw}$` : raw;
  const offset = wrap ? 1 : 0;
  const next = value.slice(0, start) + text + value.slice(end);
  if (options.maxLength && next.length > options.maxLength) return null;
  const caretOffset = spec.caret ?? raw.length;
  return {
    value: next,
    caret: start + offset + caretOffset,
    stops: (spec.stops ?? []).map((s) => s + start + offset),
  };
};

/** `{`의 짝이 되는 `}` 위치. 이스케이프(`\{`)는 건너뛴다. 없으면 -1. */
export const matchCloseBrace = (value: string, openIndex: number): number => {
  let depth = 0;
  for (let i = openIndex; i < value.length; i += 1) {
    if (value[i] === '\\') {
      i += 1;
      continue;
    }
    if (value[i] === '{') depth += 1;
    else if (value[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

/**
 * 백스페이스.
 * 모바일에서 한 글자씩 밀리는 것보다 "구조 단위로 지우기"가 안전하다 — `\fra`, `x^`, 짝 잃은 `$`는
 * KaTeX 오류나 뒤쪽 수식까지 삼키는 렌더 사고로 이어진다.
 * - 커서 앞이 LaTeX 명령(`\frac`, `\sqrt` …)이면 명령 전체
 * - 커서가 `{` 바로 뒤/빈 `{}` 안이면 그 그룹(+앞의 명령·첨자 기호) 전체
 * - 그 결과 남는 `$...$` 구분자가 짝을 잃으면 함께 정리
 */
export const applyBackspace = (value: string, sel: Selection): EditResult | null => {
  const start = Math.max(0, Math.min(sel.start, value.length));
  const end = Math.max(start, Math.min(sel.end, value.length));
  if (start !== end) {
    return { value: value.slice(0, start) + value.slice(end), caret: start, stops: [] };
  }
  if (start === 0) return null;

  const emptyPair = value[start - 1] === '{' && value[start] === '}';
  if (emptyPair || value[start - 1] === '{') {
    const before = value.slice(0, start - 1);
    const command = before.match(/\\[a-zA-Z]+$/);
    const marker = before.endsWith('^') || before.endsWith('_');
    if (emptyPair || command || marker) {
      let a = start - 1;
      let b = emptyPair ? start + 1 : start;
      if (emptyPair) {
        // 자리표시자 뒤에 붙은 빈 `{}`도 같이 (`\frac{}{}`의 분자에서 지우면 분모까지)
        while (value[b] === '{' && value[b + 1] === '}') b += 2;
      } else {
        // 내용이 있는 그룹이면 짝이 맞는 `}`까지 함께 지운다
        const close = matchCloseBrace(value, start - 1);
        b = close === -1 ? b : close + 1;
      }
      if (command) {
        a -= command[0].length;
        // 같은 명령에 붙은 나머지 인자도 함께 (`\frac{1}{2}`의 분자를 지우고 `{2}`를 남기지 않는다)
        while (b < value.length) {
          if (value[b] === '[') {
            const close = value.indexOf(']', b + 1);
            if (close === -1) break;
            b = close + 1;
            continue;
          }
          if (value[b] === '{') {
            const close = matchCloseBrace(value, b);
            if (close === -1) break;
            b = close + 1;
            continue;
          }
          break;
        }
      } else if (marker) a -= 1;
      // 남는 수식 구분자가 짝을 잃으면 같이 지운다
      if (value[a - 1] === '$' && value[b] === '$') {
        const doubled = value[a - 2] === '$' && value[b + 1] === '$';
        a -= doubled ? 2 : 1;
        b += doubled ? 2 : 1;
      }
      return { value: value.slice(0, a) + value.slice(b), caret: a, stops: [] };
    }
  }

  let cut = start;
  const before = value.slice(0, start);
  const command = before.match(/\\[a-zA-Z]+$/);
  cut = command ? start - command[0].length : start - 1;
  // 수식 구분자만 지우면 짝이 깨진다 → 구분자를 벗겨서 내용만 남긴다
  if (value[cut] === '$') {
    const marker = value[cut + 1] === '$' ? '$$' : '$';
    const close = value.indexOf(marker, cut + marker.length);
    if (close !== -1) {
      return {
        value: value.slice(0, cut) + value.slice(cut + marker.length, close) + value.slice(close + marker.length),
        caret: cut,
        stops: [],
      };
    }
  }
  return { value: value.slice(0, cut) + value.slice(end), caret: cut, stops: [] };
};

/** 두 문자열이 갈라지는 지점과 길이 변화량 */
export const changePoint = (before: string, after: string): { pos: number; delta: number } => {
  const max = Math.min(before.length, after.length);
  let pos = 0;
  while (pos < max && before[pos] === after[pos]) pos += 1;
  return { pos, delta: after.length - before.length };
};

/** 입력 중 `다음 칸` 대기열이 밀리지 않게 보정 */
export const shiftStops = (stops: number[], pos: number, delta: number): number[] =>
  delta === 0 ? stops : stops.map((s) => (s > pos ? s + delta : s));

/** 커서 뒤의 가장 가까운 `다음 칸` 지점 */
export const nextStop = (stops: number[], caret: number, length: number): number | null => {
  const usable = stops.filter((s) => s > caret && s <= length);
  return usable.length === 0 ? null : Math.min(...usable);
};
