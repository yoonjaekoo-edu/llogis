# AGENTS.md — Logis (Math Solved)

## Project overview
Korean math problem-solving platform with Glicko-2 rating system (unused — see gotchas). Three-part stack:
- `frontend/` — React 19 + Vite 6 + KaTeX (monolithic SPA, all routes ~4506 lines in `src/App.tsx`)
- `backend/` — Express + TypeScript (all routes in `src/index.ts`, ~2500 lines)
- `database/` — PostgreSQL schema (auto-loaded on container init via `docker-entrypoint-initdb.d`)

## Commands
| Context | Command |
|---------|---------|
| Full stack | `docker compose up -d` (frontend :80, backend :5000, DB :5432) |
| Rebuild after changes | `docker compose down && docker compose up -d --build` |
| Backend dev | `cd backend && npm install && npm run dev` (nodemon + ts-node) |
| Frontend dev | `cd frontend && npm install && npm run dev` (:1972, proxies `/api` `/uploads` → :5000) |
| Build backend | `cd backend && npm install --include=dev && npm run build` |
| Build frontend | `cd frontend && npm install && npm run build` (tsc + vite + terser) |
| Backend test | `cd backend && npm test` (vitest, ~48 tests for generation engine) |
| Backend test watch | `cd backend && npm run test:watch` |

## Architecture gotchas
- **Rating is a lie**: `ratingService.ts` creates its own `pg.Pool` (separate from `index.ts`), and **`Glicko2Engine` is completely unused**. Correct answers award `current_difficulty` (starts at 10k, adjusts 5k–150k by solve rate) × fever × daily bonus. Wrong answers subtract 500–3000 by tier. Rating is unbounded (no cap).
- **Problem generation engine**: `backend/src/generation/` — modular pipeline with safe recursive-descent parser (no `eval()`), variable generator, constraint validator, template renderer. ASTs cached for ~0.01ms/problem.
- **Templates**: 83 templates in `backend/data/templates.json`. Also 11 legacy templates in `backend/src/problemGenerator.ts` (hardcoded). Two separate generation paths.
- **Tests**: 48 unit tests in `backend/src/generation/__tests__/generation.test.ts` covering parser, evaluator, variable gen, constraints, templates, full pipeline, batch gen, error handling.
- **No ESLint config**: `frontend` has `"lint": "eslint ."` script but no `.eslintrc*` file.
- **Admin account**: username `admin`, seeded via `database/schema.sql`. Admin panel at `/admin` route.
- **Auth**: JWT in `localStorage`, `Authorization: Bearer <token>`, 24h expiry.
- **Docker BuildKit on ARM**: if `parent snapshot does not exist`, run `docker builder prune -af`. `docker-compose.yml` sets `provenance: false, sbom: false`.
- **Dynamic schema**: `ensureSchema()` in `backend/src/index.ts:95-263` runs at startup adding tables (groups, competitions, titles, bug_reports, notifications, page_content, quests) and columns beyond schema.sql.
- **Answer comparison**: multi-step — (1) whitespace-stripped lowercase string compare, (2) A/B/C/D letter → extract option text, (3) math equivalence via `evaluateExpression` with 1e-9 tolerance, (4) ratio `"4:1"` → first number. Duplicate correct submissions rejected (400).
- **Game mechanics**: fever (2×/5× from store, timed), streak (daily reset tracking, repair), tokens (store currency), XP (levels = floor(sqrt(XP/100)) + 1), quests (`JSONB`), daily first-correct 1.5× bonus.
- **3D rooms**: `frontend/src/GooseRoom.tsx` and `CatRoom.tsx` use three.js + framer-motion.
- **Frontend build**: terser strips `console.*`, rollup manual chunks for vendor/react/katex/helmet. Docker uses nginx (not node) to serve built assets.
- **Store items**: firework effect (100 tokens), developer chango (500 tokens, custom title request → admin notification), fever 2×/5×.

## Database
- Schema: `database/schema.sql` (users, problems, submissions, tags, problem_tags) mounted as init script
- `ensureSchema()` adds: groups, group_members, group_join_requests, group_competitions, group_competition_participants, titles, user_titles, admin_notifications, bug_reports, page_content, tier_config + many user columns (streak, xp, tokens, quests, fever, etc.)
- 100 seed problems pre-loaded with Korean math content
- Profile images stored at `backend/uploads/`, served via `/uploads/` static route with 30d cache

## Key conventions
- **UI language**: Korean (한국어) — all UI text, comments, commits in Korean
- **Styling**: Vanilla CSS in `frontend/src/styles/globals.css` with CSS custom properties for light/dark toggle
- **LaTeX**: `react-katex`, display `$$...$$`, inline `$...$`
- **Tier thresholds**: Bronze (0–), Silver (100k–), Gold (300k–), Platinum (800k–), Diamond (2M–), Ruby (5M–), Master (12M–), God (30M–), Hacker (70M–), 치피치피차파차파 (150M–), ChatGPT (300M–), 출제자 (600M–), 주인장 (1.2B–), 정답 (2.5B–). Configurable via admin API.
- **주간 리그**: `GET /api/league` (주차별 획득 레이팅 순위 + 내 순위 + 지난 주 결과), `POST /api/admin/league/settle` (지난 주 정산 즉시 실행), `POST /api/admin/league/backfill` (이번 주 점수를 `rating_activity_logs`에서 채우기). 주차 키는 KST 월요일 날짜(`getWeekKeyString()`), 점수는 `weekly_league_scores`에 제출 CTE 안에서 적립한다(정답 획득분만, 오답 패널티 제외). 지난 주 상위 3명에게 150/100/50 토큰을 `weekly_league_rewards` 마커로 주차당 1회 지급(크론 없이 조회 시 지연 정산).
- **문제 출제(유저 커스텀 문제)**: `POST /api/problems/submit` (로그인 유저, 관리자는 즉시 공개·일반 유저는 검수 대기), `GET /api/problems/mine` (내 출제 + 검수 상태·반려 사유), `GET /api/admin/problem-submissions?status=pending|approved|rejected`, `POST /api/admin/problem-submissions/:id/review` (`{action:'approve'|'reject', note}`). 컬럼: `problems.created_by` / `review_status` / `review_note` / `explanation`. 공개 목록(`GET /api/problems`)은 `review_status='approved'`만 반환하고 본인 출제 문제는 제외하며, 제출 API도 본인 문제와 미승인 문제를 403으로 막는다 (자기 문제 레이팅 파밍 차단). 일반 유저 보상은 등급제(easy 15,000 / normal 25,000 / hard 40,000)로만 정해진다.
- **Template generation API**: `POST /api/problems/templates/generate` (supports `templateId`, `unit`, `concept`, `count`), `GET /api/problems/templates` lists all templates. `GET /api/problems/templates/units` and `/concepts` for filtering.
- **Admin APIs**: tier config, user management (rating, tokens, custom title, username, problem-gen permission), problem CRUD, bug reports, notifications, page content, CSV import, mass deletion, seed.
- **Site URL**: `https://llogis.xyz`. Sitemap at `/sitemap.xml` (proxied through nginx → backend).

## Generation engine API
```
import { generateProblem, batchGenerate } from './generation/index.js';
const result = generateProblem(template);
const batch = batchGenerate(template, 100);  // ~0.01ms/problem
```
Template format: `{ id, title, difficulty, variables, constraints, problem_template, answer_formula }`. Variables: `integer`, `float`, `choice`, `boolean`. Constraints use expression syntax, retries up to 50× on failure.

## 필수 규칙
- **작업 완료 후 반드시 `git add`, `git commit`, `git push` 실행** — 장기 저장소(lgit)에 수정사항 반영
