# CLAUDE.MD – Logis (Math Solved) 요약

## 📌 프로젝트 개요
- **Logis**(Math Solved)는 한국어 기반 수학 문제 풀이 플랫폼으로, Glicko‑2 레이팅 시스템을 통해 사용자 실력 및 문제 난이도를 동적으로 조정한다.
- 프론트엔드: React 19 + Vite + TypeScript, KaTeX 를 이용해 LaTeX 수식 렌더링.
- 백엔드: Express + TypeScript, JWT 인증, PostgreSQL, Multer(프로필 이미지 업로드).
- Docker / Docker‑Compose 로 컨테이너화되어 `frontend`(5173), `backend`(5000), `database`(5432) 포트 사용.

## 🔧 주요 명령어
| 구분 | 명령어 | 비고 |
|------|--------|------|
| 전체 시작 | `docker-compose up -d` | 프론트엔드(1972), 백엔드(5000), DB(5432) 실행 |
| 백엔드 개발 | `cd backend && npm install && npm run dev` | nodemon 사용 |
| 프론트엔드 개발 | `cd frontend && npm install && npm run dev` | Vite dev 서버(5173) |
| 백엔드 빌드 | `cd backend && npm install --include=dev && npm run build` | devDependencies 포함 필요 |
| 프론트엔드 빌드 | `cd frontend && npm install && npm run build` |
| 로그 보기 | `docker-compose logs -f` |
| DB 초기화 | `docker-compose down -v` 혹은 Admin Panel `/admin` |

## 🏗 아키텍처 핵심
- **Glicko‑2**: `backend/src/rating/`에 구현, 현재 **볼래틸리티 업데이트가 미구현**이며 사용자는 정답 시 레이팅이 상승, 오답 시 하락.
- **문제 생성**: `backend/src/problemGenerator.ts` 템플릿 기반, 정수 해를 보장하도록 검증 로직 포함.
- **프론트엔드 렌더링**: `frontend/src/App.tsx`에서 `react‑katex` 로 LaTeX 표시, `localStorage`에 JWT 저장 후 `Authorization: Bearer <token>` 헤더로 API 호출.
- **데이터베이스**: `database/schema.sql`에 `users`, `problems`, `submissions` 등 주요 테이블 정의, 최초 컨테이너 시작 시 100개의 시드 문제 자동 로드.
- **프로필 이미지**: `backend/uploads/` 디렉터리에 저장, `/uploads/` 라우트로 정적 제공.

## 📜 개발 규칙 & Gotchas
- **UI 언어**: 모든 UI 텍스트와 커밋 메시지는 한국어 사용.
- **스타일**: `frontend/src/styles/globals.css`에 CSS 커스텀 프로퍼티 기반 라이트/다크 테마 지원.
- **테스트 부재**: 현재 `npm test`는 placeholder이며 실제 테스트가 없음.
- **ESLint 설정 부재**: `frontend`에 lint 스크립트는 있으나 `.eslintrc*` 파일이 없음.
- **레팅 로직 오류**: `ratingService.ts`가 자체 `pg.Pool`을 만들고 Glicko‑2 엔진을 무시해 평점이 단순히 +10,000(정답) / 0(오답) 으로 처리됨.
- **Docker BuildKit 이슈**: `parent snapshot does not exist` 오류 시 `docker builder prune -af` 실행 권장.

## 📅 로드맵 / TODO
- Glicko‑2 볼래틸티 업데이트 구현.
- 복잡한 문제 템플릿 (기하, 미적분) 추가.
- Admin Panel에 데이터 시각화 강화.
- `Glicko2Engine`에 대한 유닛 테스트 작성.

---
*본 문서는 AGENTS.MD와 GEMINI.MD의 핵심 내용을 한국어로 요약한 것입니다.*