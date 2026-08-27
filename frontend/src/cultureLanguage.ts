// 조선말 화면 변환기
// 화면 조작용 문구뿐 아니라 메인 화면, 레이팅, 커스텀 문제에 표시되는 텍스트도 변환한다.
// 수식·코드·입력값은 변환하지 않아 풀이 기능을 보존한다.
const UI_WORDS: Array<[RegExp, string]> = [
  [/조선말/g, '조선말'], [/문제 풀어보기/g, '문제 풀어보기'], [/문제 풀기/g, '문제 풀기'],
  [/문제 풀이/g, '문제 풀기'], [/문제 풀이 플랫폼/g, '문제 풀기 마당'], [/오늘의 문제/g, '오늘의 문제'], [/문제 목록/g, '문제 차림표'],
  [/커스텀 문제/g, '사용자제작 문제'], [/사용자 지정 문제/g, '사용자제작 문제'], [/커스텀/g, '사용자제작'], [/맞춤 문제/g, '사용자제작 문제'],
  [/레이팅/g, '평점'], [/레이팅 점수/g, '평점'], [/Rating/g, '평점'], [/RP/g, '평점'], [/랭킹/g, '등수판'], [/순위/g, '등수'], [/리더보드/g, '등수판'],
  [/글로벌 랭킹/g, '세계 등수판'], [/세계 랭킹/g, '세계 등수판'], [/그룹 만들기/g, '무리 만들기'], [/그룹 가입/g, '무리 등록'], [/그룹/g, '무리'],
  [/토큰 상점/g, '표식 상점'], [/로지코인/g, '로지표식'], [/상점/g, '상점'], [/소개/g, '해설'], [/관리자/g, '관리원'], [/관리/g, '관리'],
  [/로그인/g, '들어가기'], [/로그아웃/g, '나가기'], [/회원가입/g, '성원등록'], [/가입하기/g, '성원등록하기'], [/가입/g, '등록'],
  [/무료로 가입하기/g, '공짜로 성원등록하기'], [/무료로 시작하기/g, '공짜로 시작하기'], [/사용자 프로필/g, '리용자 인물소개'], [/프로필/g, '인물소개'],
  [/한국어/g, '남조선말'], [/언어/g, '말'], [/다크 모드/g, '어두운 화면'], [/라이트 모드/g, '밝은 화면'], [/다크모드/g, '어두운 화면'], [/라이트모드/g, '밝은 화면'],
  [/주 메뉴/g, '기본 목록'], [/메뉴/g, '목록'], [/닫기/g, '닫기'], [/열기/g, '열기'], [/저장하기/g, '보관하기'], [/저장/g, '보관'],
  [/취소하기/g, '그만두기'], [/취소/g, '그만두기'], [/삭제하기/g, '없애기'], [/삭제/g, '없애기'], [/수정하기/g, '고치기'], [/수정/g, '고치기'],
  [/확인하기/g, '확인하기'], [/확인/g, '확인'], [/검색하기/g, '찾아보기'], [/검색/g, '찾기'], [/불러오기/g, '가져오기'], [/내보내기/g, '내보내기'],
  [/새로고침/g, '다시하기'], [/돌아가기/g, '되돌아가기'], [/홈으로/g, '첫 화면으로'], [/시작하기/g, '시작하기'], [/시작/g, '시작'], [/끝내기/g, '끝내기'],
  [/정답입니다/g, '옳은 답입니다'], [/정답/g, '옳은 답'], [/오답/g, '그른 답'], [/제출하기/g, '내기'], [/제출/g, '내기'], [/다음 문제/g, '다음 문제'], [/다음/g, '다음'],
  [/이전 문제/g, '앞 문제'], [/이전/g, '앞'], [/완료/g, '끝냄'], [/도전하기/g, '도전하기'], [/도전/g, '도전'], [/학습하기/g, '배우기'], [/학습/g, '배우기'],
  [/풀이 과정/g, '푸는 과정'], [/해설 보기/g, '풀이글 보기'], [/풀이/g, '풀이'], [/해설/g, '풀이글'], [/난이도/g, '어려운 정도'], [/매우 어려움/g, '대단히 어려움'],
  [/칭호 획득/g, '이름표 얻음'], [/칭호/g, '이름표'], [/획득/g, '얻음'], [/장착/g, '달기'], [/보유/g, '가지고있음'], [/배지/g, '표식'], [/업적/g, '성과'],
  [/알림/g, '통지'], [/공지사항/g, '알림글'], [/공지/g, '알림글'], [/신고하기/g, '알리기'], [/신고/g, '알리기'], [/버그/g, '오류'], [/문의하기/g, '물어보기'],
  [/사용자/g, '리용자'], [/유저/g, '리용자'], [/비밀번호/g, '암호'], [/이메일/g, '전자우편'], [/무료/g, '공짜'], [/개인정보/g, '개인자료'],
  [/성공했습니다/g, '성공하였습니다'], [/실패했습니다/g, '실패하였습니다'], [/점수/g, '점수'], [/레벨/g, '수준'], [/경험치/g, '경험점수'], [/토큰/g, '표식'], [/스트릭/g, '련속기록'], [/연속 기록/g, '련속기록'], [/연속/g, '련속'],
  [/피버타임/g, '열기시간'], [/활성화/g, '켜짐'], [/비활성화/g, '꺼짐'], [/구매하기/g, '사기'], [/구매/g, '사기'], [/가격/g, '값'], [/보유 토큰/g, '가지고있는 표식'],
  [/문제 생성/g, '문제 만들기'], [/생성하기/g, '만들기'], [/생성/g, '만들기'], [/문제 수/g, '문제 개수'], [/문제 유형/g, '문제 형태'], [/정답률/g, '옳은 답률'],
  [/채점 중/g, '답을 판정하는 중'], [/채점/g, '답 판정'], [/제출 답안/g, '낸 답'], [/정답을 입력하세요/g, '옳은 답을 써넣으시오'], [/답을 입력하세요/g, '답을 써넣으시오'], [/입력하세요/g, '써넣으시오'], [/선택하세요/g, '고르시오'], [/선택/g, '고르기'],
  [/로딩 중\.\.\./g, '불러오는 중...'], [/불러오는 중/g, '가져오는 중'], [/네트워크 오류가 발생했습니다/g, '망 오류가 생겼습니다'], [/잠시 후 다시 시도해주세요/g, '잠시 뒤 다시 시도하시오'], [/다시 만나서 반가워요/g, '다시 만나 반갑소'],
  [/수학 문제를 풀고 레이팅을 올리는 재미있는 수학 학습 플랫폼입니다/g, '수학 문제를 풀며 평점을 올리는 재미있는 수학 배움마당입니다'], [/수학 문제를 풀고 레이팅을 올려보세요/g, '수학 문제를 풀고 평점을 올려보시오'], [/All rights reserved\./g, '모든 권리는 보관되여있습니다.'],
];

const originals = new WeakMap<Text, string>();
const translatedAttributes = new WeakMap<Element, Map<string, string>>();
const SKIP_SELECTOR = 'script, style, code, pre, textarea, input, [data-nk-skip]';

const isUiText = (node: Text) => {
  const parent = node.parentElement;
  return Boolean(parent) && !parent!.closest(SKIP_SELECTOR);
};

const convert = (text: string) => UI_WORDS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);

const visitAttributes = (element: Element, enabled: boolean) => {
  if (element.matches(SKIP_SELECTOR)) return;
  const attributes = ['aria-label', 'title', 'placeholder', 'alt', 'data-tooltip'];
  let saved = translatedAttributes.get(element);
  if (!saved) { saved = new Map(); translatedAttributes.set(element, saved); }
  for (const name of attributes) {
    const value = element.getAttribute(name);
    if (value === null) continue;
    if (!saved.has(name)) saved.set(name, value);
    const source = saved.get(name)!;
    const next = enabled ? convert(source) : source;
    if (value !== next) element.setAttribute(name, next);
  }
};

const visit = (root: Node, enabled: boolean) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (!isUiText(node)) continue;
    if (!originals.has(node)) originals.set(node, node.data);
    const source = originals.get(node)!;
    const next = enabled ? convert(source) : source;
    if (node.data !== next) node.data = next;
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    visitAttributes(root as Element, enabled);
    (root as Element).querySelectorAll('*').forEach(element => visitAttributes(element, enabled));
  }
};

export const applyCultureLanguage = (enabled: boolean) => {
  document.documentElement.lang = enabled ? 'ko-KP' : 'ko-KR';
  document.documentElement.dataset.language = enabled ? 'culture' : 'korean';
  visit(document.body, enabled);

  if (!enabled) return () => {};
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') visit(record.target.parentNode || document.body, true);
      else record.addedNodes.forEach(node => visit(node, true));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
};
