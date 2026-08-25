// 조선말 화면은 문제 본문·사용자 이름·수식에는 손대지 않고, 화면 조작용 문구만 바꾼다.
const UI_WORDS: Array<[RegExp, string]> = [
  [/문제 풀기/g, '문제 풀기'], [/문제/g, '문제'], [/랭킹/g, '등수판'], [/그룹/g, '무리'],
  [/상점/g, '상점'], [/소개/g, '해설'], [/관리/g, '관리'], [/로그인/g, '들어가기'],
  [/로그아웃/g, '나가기'], [/회원가입/g, '성원등록'], [/가입/g, '등록'], [/프로필/g, '인물소개'],
  [/설정/g, '설정'], [/언어/g, '말'], [/한국어/g, '남조선말'], [/다크 모드/g, '어두운 화면'],
  [/라이트 모드/g, '밝은 화면'], [/메뉴/g, '목록'], [/닫기/g, '닫기'], [/열기/g, '열기'],
  [/저장/g, '보관'], [/취소/g, '그만두기'], [/삭제/g, '없애기'], [/수정/g, '고치기'],
  [/확인/g, '확인'], [/검색/g, '찾기'], [/정답/g, '옳은 답'], [/오답/g, '그른 답'],
  [/제출/g, '내기'], [/다음/g, '다음'], [/이전/g, '앞'], [/완료/g, '끝냄'],
  [/도전/g, '도전'], [/학습/g, '학습'], [/풀이/g, '풀이'], [/해설/g, '해설'],
  [/난이도/g, '어려운 정도'], [/쉬움/g, '쉬움'], [/보통/g, '보통'], [/어려움/g, '어려움'],
  [/칭호/g, '이름표'], [/획득/g, '얻음'], [/장착/g, '달기'], [/보유/g, '가지고있음'],
  [/알림/g, '통지'], [/공지/g, '알림글'], [/신고/g, '알리기'], [/버그/g, '오류'],
  [/사용자/g, '리용자'], [/비밀번호/g, '암호'], [/이메일/g, '전자우편'], [/무료/g, '공짜'],
  [/시작하기/g, '시작하기'], [/돌아가기/g, '되돌아가기'], [/불러오기/g, '가져오기'],
  [/새로고침/g, '다시하기'], [/성공/g, '성공'], [/실패/g, '실패'], [/점수/g, '점수'],
  [/레벨/g, '수준'], [/경험치/g, '경험점수'], [/토큰/g, '표식'], [/스트릭/g, '련속기록'],
];

const originals = new WeakMap<Text, string>();

const isUiText = (node: Text) => {
  const parent = node.parentElement;
  return Boolean(parent) && !parent!.closest('script, style, code, pre, textarea, [data-nk-skip], [data-nk-content]');
};

const convert = (text: string) => UI_WORDS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);

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
};

export const applyCultureLanguage = (enabled: boolean) => {
  document.documentElement.lang = enabled ? 'ko-KP' : 'ko-KR';
  document.documentElement.dataset.language = enabled ? 'culture' : 'korean';
  visit(document.body, enabled);

  if (!enabled) return () => {};
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) visit(node, true);
      if (record.type === 'characterData') visit(record.target.parentNode || document.body, true);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
};
