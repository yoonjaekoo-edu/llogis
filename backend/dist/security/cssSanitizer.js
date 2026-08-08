"use strict";
// CSS Injection 방지 유틸리티
// 프로필 커스텀 CSS에서 위험한 속성/선택자를 차단
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeCss = sanitizeCss;
exports.isDestructiveCss = isDestructiveCss;
// 차단할 CSS 속성 패턴 (대소문자 무시)
const BLOCKED_PROPERTIES = [
    'position',
    'z-index',
    'opacity',
    'visibility',
    'display',
    'float',
    'clear',
    'overflow',
    'width',
    'height',
    'max-width',
    'max-height',
    'min-width',
    'min-height',
    'top',
    'left',
    'right',
    'bottom',
    'inset',
    'margin',
    'margin-top',
    'margin-left',
    'margin-right',
    'margin-bottom',
    'padding',
    'cursor',
    'pointer-events',
    'content',
];
// 차단할 CSS 키워드
const BLOCKED_KEYWORDS = [
    'expression(',
    'javascript:',
    'vbscript:',
    'url(',
    'data:',
    '@import',
    '@charset',
    '@namespace',
    '@font-face',
    '@keyframes',
    'animation',
    'transition',
    'behavior',
    '-moz-binding',
    'position:fixed',
    'position:sticky',
];
// 허용된 CSS 클래스 패턴 (Logis 프로필 클래스)
const ALLOWED_CLASS_PREFIXES = [
    '.profile-',
    '.auth-',
    '.btn',
    '.container',
    '.problem-',
    '.tier-',
    '.nav-',
    ':root',
    '[data-theme',
    '@media',
];
function sanitizeCss(css) {
    if (!css || typeof css !== 'string') {
        return { ok: true, clean: '' };
    }
    // 1. 기본 길이 제한 (5KB)
    if (css.length > 5000) {
        return { ok: false, clean: '', error: 'CSS는 5,000자 이내로 입력해주세요.' };
    }
    // 2. HTML 태그 주입 방지
    if (/<\s*(script|iframe|object|embed|form|input|link|meta|style|base)/i.test(css)) {
        return { ok: false, clean: '', error: 'HTML 태그는 사용할 수 없습니다.' };
    }
    // 3. 차단된 키워드 검사
    const lowerCss = css.toLowerCase();
    for (const keyword of BLOCKED_KEYWORDS) {
        if (lowerCss.includes(keyword.toLowerCase())) {
            return {
                ok: false,
                clean: '',
                error: `위험한 CSS 키워드가 감지되었습니다: ${keyword}`,
            };
        }
    }
    // 4. 차단된 속성 검사 (블록 내부의 속성 단위 검사)
    const lines = css.split('\n');
    const cleanLines = [];
    for (const line of lines) {
        const trimmed = line.trim();
        // 주석 또는 빈 줄은 허용
        if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed === '' || trimmed === '}' || trimmed === '{') {
            cleanLines.push(line);
            continue;
        }
        // 속성 라인 검사 (property: value; 형태)
        const propMatch = trimmed.match(/^([a-zA-Z-]+)\s*:/);
        if (propMatch) {
            const prop = propMatch[1].toLowerCase();
            if (BLOCKED_PROPERTIES.includes(prop)) {
                continue; // 차단된 속성은 무시 (라인 제거)
            }
        }
        cleanLines.push(line);
    }
    const clean = cleanLines.join('\n');
    // 5. 중복 세미콜론/빈 블록 정리
    const final = clean
        .replace(/\{\s*\}/g, '')
        .replace(/;\s*;/g, ';')
        .trim();
    return { ok: true, clean: final };
}
// CSS가 시각적으로 페이지를 파괴하는지 추가 검사
function isDestructiveCss(css) {
    const lower = css.toLowerCase();
    const destructive = [
        'display:none',
        'visibility:hidden',
        'opacity:0',
        'height:100vh',
        'width:100vw',
        'position:fixed',
        'position:absolute',
        'z-index:9999',
        'z-index:2147483647',
        'background-color:red',
        'background:red',
        'color:transparent',
        'font-size:0',
        'overflow:hidden',
    ];
    return destructive.some((d) => lower.replace(/\s/g, '').includes(d));
}
