# 🧠 Math Solved (Logis)

> 문제를 풀수록 실력이 측정되는 한국어 수학 문제 풀이 플랫폼
>
> 사용자 레이팅과 문제 난이도를 동적으로 계산합니다.

![Screenshot](./스크린샷%202026-05-12%20223848.png)

---

## 주요 기능

- **문제 풀이**: 다양한 난이도의 수학 문제를 풀고 레이팅/경험치/토큰 획득
- **동적 레이팅 시스템**: 문제 정답 시 난이도 기반 레이팅 상승, 오답 시 티어별 패널티
- **템플릿 기반 문제 생성**: 31개 템플릿 + 11개 레거시 템플릿으로 무한 문제 생성
- **AI 문제 생성**: NVIDIA NIM API를 통한 AI 기반 문제 생성 (사용자 API 키 필요)
- **일일 퀘스트**: 매일 3개의 랜덤 퀘스트 (문제 풀이, 정확도, 연속 정답, XP 획득 등) 보상 지급
- **랜덤 보상 상자**: 일반/레어/에픽/레전더리 상자에서 토큰, XP, 피버타임, 뱃지 획득
- **프로필 꾸미기**: 7종 그라데이션 테마 + 8종 조건부 뱃지로 프로필 커스터마이징
- **상점 시스템**: 피버타임(2×/5×), 폭죽 이펙트, 맞춤 칭호, 보상 상자 구매
- **그룹 & 대회**: 그룹 생성/가입, 그룹 내 레이팅 대회 기능
- **칭호 시스템**: 19개 칭호 — 문제 풀이, 스트릭, 랭킹, 정확도 등 다양한 조건으로 해금
- **연속 학습(스트릭)**: 매일 문제 풀이 시 스트릭 갱신, 보상 토큰 + 스트릭 복구권 지급
- **관리자 패널**: 문제/사용자/티어/템플릿/알림 관리, CSV 대량 임포트
- **3D 방**: three.js 기반 거위의 방, 개냥이의 방 (칭호 해금 조건)
- **KaTeX 수식 렌더링**: LaTeX 수식 표시/인라인 지원
- **다크모드**: CSS 커스텀 프로퍼티 기반 라이트/다크 테마

---

## 빠른 시작

```bash
# 전체 스택 실행 (Docker)
docker compose up -d

# 프론트엔드 :1972, 백엔드 :5000, DB :5432
```

### 로컬 개발

```bash
# 백엔드
cd backend && npm install && npm run dev

# 프론트엔드 (다른 터미널)
cd frontend && npm install && npm run dev
```

Vite dev 서버가 :1972에서 실행되며 `/api`, `/uploads`를 :5000으로 프록시합니다.

---

## 프로젝트 구조

```
├── frontend/          # React 19 + Vite 6 SPA
│   ├── src/
│   │   ├── App.tsx    # 전체 라우트 (~4500줄, 모놀리식)
│   │   ├── GooseRoom.tsx / CatRoom.tsx  # 3D 방
│   │   └── styles/globals.css
│   ├── nginx.conf     # 프로덕션 nginx 설정
│   └── Dockerfile     # nginx 기반 정적 서빙
│
├── backend/           # Express + TypeScript
│   ├── src/
│   │   ├── index.ts   # 전체 API 라우트 (~2500줄)
│   │   ├── generation/  # 문제 생성 엔진 (파서, 변수, 제약조건, 템플릿)
│   │   ├── rating/      # 레이팅 서비스 (Glicko2Engine 미사용)
│   │   ├── problemGenerator.ts     # 11개 레거시 템플릿
│   │   ├── templateProblemGenerator.ts  # 31개 템플릿 로더
│   │   └── nimGenerator.ts         # NVIDIA NIM AI 생성
│   ├── data/templates.json  # 31개 템플릿 정의
│   └── uploads/       # 프로필 이미지 저장
│
└── database/
    └── schema.sql     # 초기 스키마 + 100개 시드 문제
```

---

## 주요 아키텍처 참고

| 항목 | 내용 |
|------|------|
| **인증** | JWT, `localStorage` 저장, `Authorization: Bearer <token>`, 24시간 만료 |
| **레이팅** | `Glicko2Engine`은 미사용. 정답 = 문제 난이도(5k~150k), 오답 = -500~-3000 |
| **정답 비교** | 공백제거 → 소문자 → A/B/C/D 선택지 매칭 → 수식 평가(1e-9) → 비율 파싱 |
| **문제 생성** | 템플릿 기반, `eval()` 없는 안전한 파서, 최대 50회 재시도 |
| **DB 스키마** | `schema.sql` + `ensureSchema()`가 시작 시 동적 테이블/컬럼 추가 |
| **관리자** | `admin` 계정, `/admin` 패널에서 모든 관리 기능 접근 |
| **사이트** | [https://llogis.xyz](https://llogis.xyz), sitemap: `/sitemap.xml` |

---

## Tech Stack

**Frontend**: React 19, TypeScript, Vite 6, KaTeX, three.js, framer-motion

**Backend**: Node.js, Express, TypeScript, PostgreSQL, JWT, bcrypt, Multer

**DevOps**: Docker, Docker Compose, nginx

---

## 라이선스

MIT
