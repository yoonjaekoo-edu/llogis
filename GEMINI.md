# 🧠 Math Solved (Logis) - GEMINI.md

## 🚀 Project Overview
Math Solved (internally referred to as **Logis**) is an interactive math learning platform where user skill levels and problem difficulties are dynamically calculated using the **Glicko-2 rating system**. It features a React-based frontend and a Node.js/Express backend, both built with TypeScript and containerized using Docker.

### Key Technologies
- **Frontend:** React, TypeScript, Vite, KaTeX (for math rendering), React Router.
- **Backend:** Node.js, Express, TypeScript, JWT (Authentication), PostgreSQL (Database), Multer (multipart uploads for profile images).
- **Rating System:** Custom Glicko-2 implementation for dynamic user and problem difficulty adjustments.
- **DevOps:** Docker, Docker Compose.

---

## 🛠 Building and Running

### Prerequisites
- Docker and Docker Compose installed.

### Commands
- **Start Environment:** `docker-compose up -d`
- **Build Services:** `docker-compose build`  
  Backend 이미지는 `tsc` 빌드에 `@types/*`가 필요하므로 Dockerfile에서 `npm install --include=dev`로 devDependencies를 포함합니다. 로컬에서 백엔드만 빌드할 때는 `cd backend && npm install && npm run build`로 동일하게 확인할 수 있습니다.
- **Raspberry Pi / BuildKit:** `docker compose` 빌드가 `parent snapshot ... does not exist` 로 실패하면 로컬 BuildKit 캐시 손상 가능성이 큽니다. `docker builder prune -af` 후 다시 빌드하거나, `docker compose`가 오래된 경우 Docker/Compose를 최신으로 올리세요. 저장소의 `docker-compose.yml`은 `provenance: false`, `sbom: false`로 기본 어테스테이션을 끄도록 설정되어 있습니다.
- **View Logs:** `docker-compose logs -f`
- **Database Reset:** Use the Admin Panel `/admin` (admin account required) or `docker-compose down -v` to clear persistent data.

### Local Development (without Docker)
- **Backend:**
  - `cd backend && npm install`
  - `npm run dev` (uses nodemon)
- **Frontend:**
  - `cd frontend && npm install`
  - `npm run dev` (runs on http://localhost:5173)

---

## 🏗 Architecture & Core Logic

### 📈 Glicko-2 Rating System (`backend/src/rating/`)
The system calculates a user's `rating`, `rating_deviation` (RD), and `volatility`. 
- **User Rating:** Increases on correct answers, decreases on wrong ones. The magnitude depends on the problem's current difficulty relative to the user's rating.
- **Problem Difficulty:** Adjusts based on user performance. If many high-rated users fail a problem, its difficulty increases.

### 🧮 Problem Generation (`backend/src/problemGenerator.ts`)
Problems are generated from templates with random variables.
- **Templates:** Define the problem text (LaTeX), answer formula, and variable ranges.
- **Validation:** Specific logic ensures linear equations and systems of equations have integer solutions.

### 🎨 Frontend Rendering (`frontend/src/App.tsx`)
- **KaTeX:** Uses `react-katex` to render LaTeX formulas found in problem content.
- **State Management:** Uses React `useState` and `useEffect`. Authentication tokens and user info are stored in `localStorage`.
- **Tiers:** Users are assigned ranks (Bronze to Hacker) based on their rating points.

---

## 📜 Development Conventions

### Language Mandate
- **Communication:** Always respond in **Korean** (한국어) for all interactions.

### Coding Style
- **TypeScript:** Strict typing is preferred. Use interfaces for data models (e.g., `User`, `Problem`, `Rating`).
- **Styling:** Vanilla CSS is used (see `frontend/src/styles/globals.css`).
- **API Communication:** Use `fetch` with JWT in the `Authorization` header (`Bearer <token>`).

### Database
- **Schema:** Defined in `database/schema.sql`.
- **Initialization:** The database is automatically seeded with 100 math problems on first run via `docker-entrypoint-initdb.d`.

### Security
- **Auth:** JWT-based authentication for sensitive routes.
- **Passwords:** Hashed using `bcrypt` (10 rounds).

---

## 📅 Roadmap / TODOs
- [ ] Implement Glicko-2 volatility updates (currently static).
- [ ] Add more complex problem templates (Geometry, Calculus).
- [ ] Enhance the Admin Panel with more granular data visualization.
- [ ] Add unit tests for the `Glicko2Engine`.
