import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getPool } from './db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { evaluateExpression } from './generation/mathParser.js';
import { checkAnswer } from './grading/answerCheck.js';
import { generateProblem } from './problemGenerator';
import {
  getAllTemplates,
  getTemplateById,
  getUnits,
  getConcepts,
  generateProblems as generateTemplateProblems,
  batchGenerate,
  reloadTemplates,
  updateTemplate as updateTemplateData,
  updateTemplateRewardRating,
  addTemplate,
  deleteTemplate,
} from './templateProblemGenerator';
import { getTier, processSubmission, getTierConfig, updateTierConfig } from './rating/ratingService';
import { LEAGUE_MIN_SCORE, LEAGUE_REWARD_TOKENS, pickLeagueWinners } from './rating/leagueWinners';
import {
  BOX_RARITY_ORDER,
  BOX_TIERS,
  daysToNextRarity,
  rarityForStreak,
  rollDailyBox,
  upgradeChance
} from './box/dailyBox';
import { getTodayString, getWeekKeyString, shiftWeekKey, getWeekRange } from './rating/gameSystemService';
import { signupRateLimit, loginRateLimit, profileRateLimit, trialRateLimit } from './security/rateLimiter';
import {
  isDisposableEmail,
  getIpSubnet,
  isValidEmail,
  isValidUsername,
  validatePassword,
  validateBio,
  generateServerFingerprint,
  checkAbuse,
  recordFingerprint,
} from './security/signupGuard';
import { calculateExchangeQuote, canReceiveTokens, MAX_TOKEN_BALANCE, MIN_EXCHANGE_RP } from './rpExchange.js';
import path from 'path';
import { randomBytes } from 'crypto';
import fs from 'fs';
import multer from 'multer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Ensure uploads directory exists (skip on Vercel — read-only filesystem)
const uploadsDir = path.join(__dirname, '../uploads');
if (!process.env.VERCEL) {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch (e) {
    console.warn('Failed to create uploads directory:', e);
  }
}

// Multer storage configuration
const storage = process.env.VERCEL
  ? multer.memoryStorage()
  : multer.diskStorage({
  destination: (
    _req: Request,
    _file: Express.Multer.File,
    cb: (err: Error | null, destination: string) => void
  ) => {
    cb(null, uploadsDir);
  },
  filename: (
    _req: Request,
    file: Express.Multer.File,
    cb: (err: Error | null, filename: string) => void
  ) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype.toLowerCase());
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed (jpeg, jpg, png, gif, webp, heic, heif)'));
  },
});

const pool = getPool();

// nginx/리버스 프록시 뒤에서 클라이언트 IP 추출
const getClientIp = (req: Request): string => {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

app.use(cors());
app.use(express.json());
app.disable('x-powered-by');
app.set('trust proxy', 1); // nginx/docker/리버스 프록시 뒤에서 정확한 IP 감지
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '30d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, immutable, max-age=2592000');
  }
}));

const frontendDist = path.join(__dirname, '../public');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

const ensureSchema = async () => {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT');
  // 초대(추천) 링크용 — 코드는 대문자+숫자 8자리, 계정당 하나
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code VARCHAR(16)');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code_key ON users (invite_code) WHERE invite_code IS NOT NULL');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS can_generate_problems BOOLEAN DEFAULT FALSE');
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_title VARCHAR(50) DEFAULT ''");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS has_firework_effect BOOLEAN DEFAULT FALSE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS has_developer_chango BOOLEAN DEFAULT FALSE");
  await pool.query('ALTER TABLE problems ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT FALSE');
  await pool.query('ALTER TABLE problems ADD COLUMN IF NOT EXISTS custom_reward_rating FLOAT');
  // 유저 출제 문제: 출제자 + 검수 상태. 기존 문제·관리자 문제는 approved로 백필된다.
  await pool.query('ALTER TABLE problems ADD COLUMN IF NOT EXISTS created_by INTEGER');
  await pool.query("ALTER TABLE problems ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'approved'");
  await pool.query("ALTER TABLE problems ADD COLUMN IF NOT EXISTS review_note TEXT DEFAULT ''");
  await pool.query("ALTER TABLE problems ADD COLUMN IF NOT EXISTS explanation TEXT DEFAULT ''");
  // 분야별 통계(다각형 그래프)의 근거: 어느 템플릿/단원/도메인에서 나온 문제인지
  await pool.query('ALTER TABLE problems ADD COLUMN IF NOT EXISTS template_id VARCHAR(64)');
  await pool.query('ALTER TABLE problems ADD COLUMN IF NOT EXISTS unit VARCHAR(64)');
  await pool.query('ALTER TABLE problems ADD COLUMN IF NOT EXISTS domain VARCHAR(32)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_problems_domain ON problems (domain)');
  await pool.query("UPDATE problems SET review_status = 'approved' WHERE review_status IS NULL");
  await pool.query('CREATE INDEX IF NOT EXISTS idx_problems_review_status ON problems (review_status)');
  await pool.query('ALTER TABLE problems ADD COLUMN IF NOT EXISTS reward_rating FLOAT');
  await pool.query("UPDATE problems SET is_custom = FALSE WHERE is_custom IS NULL");
  await pool.query("ALTER TABLE problems ALTER COLUMN is_custom SET DEFAULT FALSE");
  await pool.query('ALTER TABLE problems ADD COLUMN IF NOT EXISTS total_attempts INTEGER DEFAULT 0');
  await pool.query('ALTER TABLE problems ADD COLUMN IF NOT EXISTS correct_attempts INTEGER DEFAULT 0');
  await pool.query(`
    UPDATE problems p SET
      total_attempts = COALESCE((SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id), 0),
      correct_attempts = COALESCE((SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id AND s.is_correct = true), 0)
  `);
  await pool.query(`
    UPDATE problems SET current_difficulty = 
      GREATEST(5000, LEAST(150000, ROUND(150000 - (150000 - 5000) * correct_attempts::float / NULLIF(total_attempts, 0))))
    WHERE total_attempts > 0 AND (is_custom IS NULL OR is_custom = FALSE)
  `);
  await pool.query(`
    UPDATE problems SET current_difficulty = 10000
    WHERE (total_attempts IS NULL OR total_attempts = 0) AND (is_custom IS NULL OR is_custom = FALSE)
  `);
  // 커스텀 문제는 시도 0회여도 보상을 덮어쓰지 않는다 (문제별로 지정한 값 유지)
  await pool.query(`
    UPDATE problems SET current_difficulty = GREATEST(5000, LEAST(150000, COALESCE(current_difficulty, initial_difficulty, 60000)))
    WHERE (total_attempts IS NULL OR total_attempts = 0) AND is_custom = TRUE
  `);

  // CURATED-CUSTOM-2026-08-19: hand-checked custom problems. Idempotent by title.
  await pool.query(`
    INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, is_custom, custom_reward_rating, reward_rating)
    SELECT v.title, v.content, v.answer, v.difficulty, v.difficulty, 'Calculation', TRUE, v.difficulty, v.difficulty
    FROM (VALUES
      ('[검수] 일차방정식 기본', '$3(x-2)+5=2x+11$을 만족하는 $x$의 값을 구하시오.', '12', 12000),
      ('[검수] 등차수열 제12항', '첫째항이 $7$, 공차가 $3$인 등차수열의 제12항을 구하시오.', '40', 14000),
      ('[검수] 세 자리 짝수의 개수', '숫자 $1,2,3,4$ 중 서로 다른 세 숫자를 사용하여 만들 수 있는 세 자리 자연수 중 짝수의 개수를 구하시오.', '12', 16000),
      ('[검수] 연립방정식과 곱', '$x+y=17$, $x-y=5$일 때, $xy$의 값을 구하시오.', '66', 17000),
      ('[검수] 직사각형의 넓이', '직사각형의 한 변의 길이가 $5$이고 대각선의 길이가 $13$일 때, 이 직사각형의 넓이를 구하시오.', '60', 18000),
      ('[검수] 같은 색 공의 확률', '주머니에 빨간 공 3개와 파란 공 2개가 있다. 한 번에 2개의 공을 동시에 꺼낼 때, 두 공의 색이 같을 확률을 기약분수로 나타내시오.', '2/5', 20000),
      ('[검수] 이차방정식 두 근의 제곱합', '이차방정식 $x^2-7x+12=0$의 두 근을 $\alpha, \beta$라 할 때, $\alpha^2+\beta^2$의 값을 구하시오.', '25', 22000),
      ('[검수] 나머지 조건의 합', '200보다 작은 자연수 $n$ 중 $n$을 5로 나누면 나머지가 2이고, 7로 나누면 나머지가 4인 모든 $n$의 합을 구하시오.', '510', 24000)
    ) AS v(title, content, answer, difficulty)
    WHERE NOT EXISTS (SELECT 1 FROM problems p WHERE p.title = v.title);
  `);
  // CURATED-CUSTOM-2026-08-22: hard hand-checked custom problems. Idempotent by title.
  await pool.query(`
    INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, is_custom, custom_reward_rating, reward_rating)
    SELECT v.title, v.content, v.answer, v.difficulty, v.difficulty, 'Calculation', TRUE, v.difficulty, v.difficulty
    FROM (VALUES
      ('[검수 II] 나머지 조건의 자연수', '1000보다 작은 자연수 $n$이 있다. $n$을 7로 나누면 나머지가 3, 9로 나누면 나머지가 5, 11로 나누면 나머지가 7이다. $n$의 값을 구하시오.', '689', 20000),
      ('[검수 II] 이차방정식 근의 세제곱합', '이차방정식 $x^2-8x+10=0$의 두 근을 $\alpha, \beta$라 할 때, $\alpha^3+\beta^3$의 값을 구하시오.', '272', 21000),
      ('[검수 II] 삼각형 내접원의 반지름', '세 변의 길이가 각각 13, 14, 15인 삼각형의 내접원의 반지름을 구하시오.', '4', 19000),
      ('[검수 II] 합이 3의 배수인 조합', '숫자 1, 2, 3, 4, 5, 6, 7 중 서로 다른 세 수를 고를 때, 세 수의 합이 3의 배수인 경우의 수를 구하시오.', '13', 21000),
      ('[검수 II] 부정방정식의 양의 정수해', '양의 정수 $x, y$가 $3x+5y=100$을 만족할 때, 순서쌍 $(x,y)$의 개수를 구하시오.', '6', 19000),
      ('[검수 II] 제곱수가 되는 곱', '1부터 9까지 적힌 카드 중 서로 다른 두 장을 고를 때, 두 수의 곱이 완전제곱수가 되는 경우의 수를 구하시오.', '4', 20000),
      ('[검수 II] 세 변수의 음이 아닌 정수해', '음이 아닌 정수 $x, y, z$가 $x+2y+3z=12$를 만족할 때, 순서쌍 $(x,y,z)$의 개수를 구하시오.', '19', 22000),
      ('[검수 II] 배수 조건과 포함배제', '1부터 100까지의 자연수 중 2 또는 3의 배수이면서 5의 배수가 아닌 수의 개수를 구하시오.', '54', 20000)
    ) AS v(title, content, answer, difficulty)
    WHERE NOT EXISTS (SELECT 1 FROM problems p WHERE p.title = v.title);
  `);

  // Drop the CASCADE constraint and recreate with SET NULL (submissions survive problem deletion)
  // 레이팅 기준: 커스텀 문제 보상은 문제에 저장된 값(current_difficulty)을 그대로 쓰고,
  // 양산 문제만 5,000~7,000으로 정규화한다. (예전에는 커스텀도 45,000~55,000으로 강제 정규화해
  // 정답률이 낮은 문제가 전부 55,000으로 몰렸고, 관리자가 지정한 값도 매 부팅마다 덮였다.)
  await pool.query(`
    UPDATE problems SET
      initial_difficulty = CASE
        WHEN is_custom = TRUE THEN COALESCE(initial_difficulty, 45000 + MOD(id, 5) * 2500)
        ELSE 5000 + MOD(id, 5) * 500
      END,
      current_difficulty = CASE
        WHEN is_custom = TRUE THEN COALESCE(current_difficulty, custom_reward_rating, 50000)
        ELSE GREATEST(5000, LEAST(7000, COALESCE(current_difficulty, 6000)))
      END,
      reward_rating = COALESCE(reward_rating, CASE WHEN is_custom = TRUE THEN 45000 + MOD(id, 5) * 2500 ELSE 5000 + MOD(id, 5) * 500 END),
      custom_reward_rating = COALESCE(custom_reward_rating, CASE WHEN is_custom = TRUE THEN COALESCE(current_difficulty, 45000 + MOD(id, 5) * 2500) ELSE NULL END)
  `);

  // 일회성 복구: 부팅 정규화가 커스텀 보상을 55,000으로 덮어쓰던 동안 사라진 문제별 보상을
  // custom_reward_rating(문제 id 기준 45,000~55,000 분배값)으로 되돌린다. 마커로 1회만 실행.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const rewardRepair = await pool.query(`
    INSERT INTO app_migrations (id) VALUES ('custom-reward-unflatten')
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `);
  if (rewardRepair.rows.length > 0) {
    const repaired = await pool.query(`
      UPDATE problems SET current_difficulty = custom_reward_rating
      WHERE is_custom = TRUE AND custom_reward_rating IS NOT NULL
    `);
    console.log(`[migration] 커스텀 문제 보상 복구: ${repaired.rowCount}건`);
  }

  await pool.query('ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_problem_id_fkey');
  await pool.query('ALTER TABLE submissions ADD CONSTRAINT submissions_problem_id_fkey FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE SET NULL');

  // 주간 리그: 주차별 획득 레이팅 + 정산 마커
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weekly_league_scores (
      user_id INTEGER NOT NULL,
      week_key VARCHAR(10) NOT NULL,
      score BIGINT NOT NULL DEFAULT 0,
      solved INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, week_key)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_weekly_league_scores_week ON weekly_league_scores (week_key, score DESC)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weekly_league_rewards (
      week_key VARCHAR(10) PRIMARY KEY,
      winners JSONB DEFAULT '[]'::jsonb,
      settled_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_submissions_correct ON submissions (user_id, problem_id) WHERE is_correct = true');
  await pool.query("UPDATE users SET can_generate_problems = TRUE WHERE username = 'admin'");
  await pool.query("INSERT INTO tags (name) VALUES ('이차방정식') ON CONFLICT (name) DO NOTHING");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_title VARCHAR(100) DEFAULT ''");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS problems_solved INTEGER DEFAULT 0");
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS rating FLOAT DEFAULT 0');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens INTEGER DEFAULT 0');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0');
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_date VARCHAR(10) DEFAULT ''");
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_repaired BOOLEAN DEFAULT FALSE');
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS quests JSONB DEFAULT '[]'::jsonb");
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS fever_multiplier FLOAT DEFAULT 1.0');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS fever_expires_at TIMESTAMP WITH TIME ZONE');
  // Initialize problems_solved from existing correct submissions
  await pool.query(`
    UPDATE users u SET problems_solved = (
      SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id AND s.is_correct = true
    ) WHERE u.problems_solved = 0
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      from_username VARCHAR(50),
      related_id INTEGER,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signup_fingerprints (
      id SERIAL PRIMARY KEY,
      visitor_id VARCHAR(64) NOT NULL,
      ip_subnet VARCHAR(64) NOT NULL,
      user_agent TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_signup_fingerprints_visitor ON signup_fingerprints (visitor_id, created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_signup_fingerprints_ip ON signup_fingerprints (ip_subnet, created_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT '기타',
      description TEXT NOT NULL,
      steps TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS box_openings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      day_key VARCHAR(10) NOT NULL,
      rarity VARCHAR(16) NOT NULL,
      rating_reward INTEGER NOT NULL,
      token_reward INTEGER NOT NULL,
      streak_at INTEGER NOT NULL DEFAULT 0,
      upgraded BOOLEAN NOT NULL DEFAULT FALSE,
      opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, day_key)
    )
  `);
  // (user_id, day_key) UNIQUE가 하루 1회를 서버에서 강제한다(동시 요청도 하나만 통과).
  await pool.query(`
    CREATE INDEX IF NOT EXISTS box_openings_user_idx ON box_openings (user_id, opened_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS titles (
      id SERIAL PRIMARY KEY,
      title_id VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(255) NOT NULL,
      condition_type VARCHAR(50) NOT NULL,
      condition_value INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_titles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title_id VARCHAR(50) NOT NULL,
      unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, title_id)
    )
  `);
  await pool.query(`
    INSERT INTO titles (title_id, name, description, condition_type, condition_value) VALUES
      ('goose_room', '꽥?', '거위의 방에 방문하세요', 'goose_room', 1),
      ('cat_room', '개냥이', '개냥이의 방에 방문하세요', 'cat_room', 1),
      ('dark_mode', '어둠의 Logis', '다크 모드를 1회 활성화하세요', 'dark_mode', 1),
      ('culture_language', '위쪽인가?', '조선말 화면을 1회 활성화하세요', 'culture_language', 1),
      ('solve_10', '막 입문함', '문제 10개를 해결하세요', 'solve_count', 10),
      ('solve_50', '좀 풀어봤다', '문제 50개를 해결하세요', 'solve_count', 50),
      ('solve_100', '수학 좀 친다', '문제 100개를 해결하세요', 'solve_count', 100),
      ('solve_500', '문제는 나의 운명', '문제 500개를 해결하세요', 'solve_count', 500),
      ('solve_1000', 'Logis에 갇힌 자', '문제 1000개를 해결하세요', 'solve_count', 1000),
      ('streak_7', '일주일의 약속', '7일 연속 스트릭 달성', 'streak', 7),
      ('streak_30', '버티는 자에게', '30일 연속 스트릭 달성', 'streak', 30),
      ('streak_100', '100일의 전설', '100일 연속 스트릭 달성', 'streak', 100),
      ('streak_365', '1년을 함께해줘서 고마워', '365일 연속 스트릭 달성', 'streak', 365),
      ('rank_10', 'TOP 10', '순위 10위 이내 진입', 'ranking', 10),
      ('rank_3', 'TOP 3', '순위 3위 이내 진입', 'ranking', 3),
      ('rank_1', '정상은 외롭다', '1위 달성', 'ranking', 1),
      ('accuracy_master', '빗나가지 않는 자', '통합 정확도 90% 이상', 'accuracy', 90),
      ('first_correct', '첫 걸음', '첫 문제 정답 맞추기', 'solve_count', 1),
      ('token_hoarder', '토큰은 내 친구', '토큰 1000개 이상 보유', 'tokens', 1000),
      ('xp_master', '경험치 중독자', 'XP 10000 이상 획득', 'xp', 10000),
      ('one_shot_one_kill', '원샷원킬', '문제 20개를 연속으로 정답 맞히세요', 'consecutive_correct', 20),
      ('box_first', '깡의 시작', '상자깡을 1번 개봉하세요', 'box_openings', 1),
      ('box_10', '상자깡 중독', '상자깡을 10번 개봉하세요', 'box_openings', 10),
      ('box_50', '깡 고인물', '상자깡을 50번 개봉하세요', 'box_openings', 50),
      ('box_streak_7', '개근 깡', '상자깡을 7일 연속 개봉하세요', 'box_streak', 7),
      ('box_legend_5', '운빨의 화신', '전설 상자를 5번 개봉하세요', 'box_legendary', 5),
      ('welcome', '새로 온 자', '가입을 환영합니다', 'signup', 1),
      ('invite_3', '전도의 손', '친구 3명을 초대하세요', 'referrals', 3)
    ON CONFLICT (title_id) DO UPDATE SET condition_value = EXCLUDED.condition_value, description = EXCLUDED.description
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_join_requests (
      id SERIAL PRIMARY KEY,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_competitions (
      id SERIAL PRIMARY KEY,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      title VARCHAR(100) NOT NULL,
      description TEXT,
      duration_hours INTEGER NOT NULL,
      start_time TIMESTAMP WITH TIME ZONE NOT NULL,
      end_time TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_competition_participants (
      competition_id INTEGER REFERENCES group_competitions(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      initial_rating FLOAT NOT NULL DEFAULT 0,
      PRIMARY KEY (competition_id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS page_content (
      page_key VARCHAR(100) PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    INSERT INTO page_content (page_key, content) VALUES ('about', '')
    ON CONFLICT (page_key) DO NOTHING
  `);

  // Profile decorations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_themes (
      id SERIAL PRIMARY KEY,
      theme_id VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(255) NOT NULL,
      gradient VARCHAR(255) NOT NULL,
      cost INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profile_themes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      theme_id VARCHAR(50) NOT NULL,
      UNIQUE(user_id, theme_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_badges (
      id SERIAL PRIMARY KEY,
      badge_id VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(255) NOT NULL,
      icon VARCHAR(10) NOT NULL DEFAULT '',
      condition_type VARCHAR(50),
      condition_value INTEGER DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profile_badges (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      badge_id VARCHAR(50) NOT NULL,
      UNIQUE(user_id, badge_id)
    )
  `);
  // 업로드 이미지 저장소(문제 그림 + 프로필 사진). Vercel 서버리스는 파일 저장이 안 되므로
  // DB에 직접 넣고, 추측 불가한 토큰으로 서빙한다(<img src>는 인증 헤더를 못 보내므로 공개 경로여야 한다).
  // 처음엔 problem_images였고 프로필 사진까지 담게 되어 uploaded_images로 이름을 바꿨다(기존 표는 이름만 변경).
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.problem_images') IS NOT NULL AND to_regclass('public.uploaded_images') IS NULL THEN
        ALTER TABLE problem_images RENAME TO uploaded_images;
        -- 인덱스 이름도 함께 맞춰 둔다(안 맞추면 새 DB와 이름이 갈린다).
        ALTER INDEX IF EXISTS problem_images_problem_id_idx RENAME TO uploaded_images_problem_id_idx;
        ALTER INDEX IF EXISTS problem_images_pkey RENAME TO uploaded_images_pkey;
        ALTER INDEX IF EXISTS problem_images_token_key RENAME TO uploaded_images_token_key;
      END IF;
    END $$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploaded_images (
      id SERIAL PRIMARY KEY,
      token VARCHAR(64) UNIQUE NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
      scope VARCHAR(16) NOT NULL DEFAULT 'problem',
      mime VARCHAR(64) NOT NULL,
      data BYTEA NOT NULL,
      byte_size INTEGER NOT NULL,
      problem_id INTEGER REFERENCES problems(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE uploaded_images ADD COLUMN IF NOT EXISTS scope VARCHAR(16) NOT NULL DEFAULT 'problem'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS uploaded_images_problem_id_idx ON uploaded_images (problem_id)`);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_theme VARCHAR(50) DEFAULT 'default'
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_css TEXT DEFAULT ''
  `);
  await pool.query(`
    INSERT INTO profile_themes (theme_id, name, description, gradient, cost) VALUES
      ('default', '기본 테마', 'Logis 기본 프로필 테마', 'linear-gradient(135deg, var(--color-4), #7b5ff5)', 0),
      ('ocean', '오션 블루', '시원한 바다를 닮은 블루 테마', 'linear-gradient(135deg, #2193b0, #6dd5ed)', 200),
      ('sunset', '선셋 오렌지', '아름다운 노을빛 테마', 'linear-gradient(135deg, #f093fb, #f5576c)', 200),
      ('forest', '포레스트 그린', '자연과 함께하는 그린 테마', 'linear-gradient(135deg, #11998e, #38ef7d)', 200),
      ('midnight', '미드나잇 퍼플', '신비로운 자줏빛 테마', 'linear-gradient(135deg, #4a00e0, #8e2de2)', 300),
      ('golden', '골든 로열', '황금처럼 빛나는 테마', 'linear-gradient(135deg, #f7971e, #ffd200)', 500),
      ('crystal', '크리스탈', '투명하게 빛나는 크리스탈 테마', 'linear-gradient(135deg, #00b4db, #0083b0)', 500)
    ON CONFLICT (theme_id) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description,
      gradient = EXCLUDED.gradient, cost = EXCLUDED.cost
  `);
  await pool.query(`
    INSERT INTO profile_badges (badge_id, name, description, icon, condition_type, condition_value) VALUES
      ('early_bird', '얼리 버드', 'Logis에 일찍 가입한 회원', '', NULL, 0),
      ('solve_10', '문제 해결사', '10문제 해결', '', 'solve_count', 10),
      ('solve_50', '프로블럼 솔버', '50문제 해결', '', 'solve_count', 50),
      ('solve_100', '마스터 솔버', '100문제 해결', '', 'solve_count', 100),
      ('streak_7', '위클리 챌린저', '7일 연속 스트릭', '', 'streak', 7),
      ('streak_30', '먼슬리 챌린저', '30일 연속 스트릭', '', 'streak', 30),
      ('streak_100', '시즌 챌린저', '100일 연속 스트릭', '', 'streak', 100),
      ('lucky_legend', '전설의 행운', '레전더리 상자에서 획득', '', NULL, 0)
    ON CONFLICT (badge_id) DO NOTHING
  `);
  // 템플릿에서 나온 기존 문제들에 단원·도메인·태그를 채워 넣는다.
  // (생성기는 문제 제목을 템플릿 제목 그대로 쓰고 78개 제목이 모두 고유하므로 되짚을 수 있다.
  //  멱등하므로 배포·기동 때마다 돌려도 안전하다.) 실패해도 서버는 계속 뜬다.
  try {
    const backfilled = await backfillProblemDomains();
    if (backfilled.matchedProblems > 0 || backfilled.tagsInserted > 0) {
      console.log(`도메인 백필: 문제 ${backfilled.matchedProblems}건, 태그 ${backfilled.tagsInserted}건`);
    }
  } catch (err) {
    console.warn('도메인 백필을 건너뜁니다:', err);
  }

  // 문제가 성립하지 않던 템플릿의 문제를 지우고, 오류를 고친 템플릿 문제를 다시 생성한다.
  // 파괴적이라 정확히 한 번만 돌도록 app_migrations 마커로 막는다.
  try {
    const cleanupId = 'template-cleanup-2026-10';
    const already = await pool.query('SELECT 1 FROM app_migrations WHERE id = $1', [cleanupId]);
    if (already.rows.length === 0) {
      const result = await rebuildTemplateProblems();
      await pool.query('INSERT INTO app_migrations (id) VALUES ($1)', [cleanupId]);
      const summary = `템플릿 정리: 문제 ${result.deletedProblems}건 삭제, ${result.generatedProblems}건 재생성 (${result.templates.length}개 템플릿)`;
      console.log(summary);
      // 조용히 실패/성공하지 않도록 관리자 알림에도 남긴다.
      await pool.query(
        'INSERT INTO admin_notifications (type, message, from_user_id, from_username, related_id) VALUES ($1, $2, $3, $4, $5)',
        ['template_cleanup', summary, null, '시스템', null]
      );
    }
  } catch (err: any) {
    console.warn('템플릿 정리를 건너뜁니다:', err);
    try {
      await pool.query(
        'INSERT INTO admin_notifications (type, message, from_user_id, from_username, related_id) VALUES ($1, $2, $3, $4, $5)',
        ['template_cleanup_error', `템플릿 정리 실패: ${err?.message || err}`, null, '시스템', null]
      );
    } catch (e) { /* 알림 실패는 무시 */ }
  }
};

const authenticateToken = (req: any, res: any, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

const canGenerateProblems = async (userId: number) => {
  const result = await pool.query('SELECT username, can_generate_problems FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];
  return !!user && (user.username === 'admin' || user.can_generate_problems === true);
};

// 가입 축하 보상 — 새 유저가 빈 화면 대신 뭔가 가진 상태로 시작하게 한다.
const WELCOME_RATING = 5000;
const WELCOME_TOKENS = 30;
// 초대 보상 — 초대한 사람과 초대받은 사람 모두에게
const REFERRAL_TOKENS = 30;

// 초대 코드 생성(대문자+숫자 8자리, 헷갈리는 O/0·I/1 제외)
const generateInviteCode = async (): Promise<string> => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const exists = await pool.query('SELECT 1 FROM users WHERE invite_code = $1', [code]);
    if (exists.rows.length === 0) return code;
  }
  throw new Error('초대 코드를 만들지 못했습니다.');
};

app.post('/api/auth/signup', signupRateLimit, async (req: Request, res: Response) => {
  const { username, email, password, userAgent, language, ref } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields are required' });

  // 1. 입력값 유효성 검사
  const nameCheck = isValidUsername(username);
  if (!nameCheck.ok) return res.status(400).json({ error: nameCheck.error });

  const emailCheck = isValidEmail(email);
  if (!emailCheck) return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
  if (isDisposableEmail(email)) {
    return res.status(400).json({ error: '일회용 이메일은 사용할 수 없습니다.' });
  }

  const passCheck = validatePassword(password);
  if (!passCheck.ok) return res.status(400).json({ error: passCheck.error });

  const ip = getClientIp(req);
  const ipSubnet = getIpSubnet(ip);


  try {
    // 2. 다중계정 어뷰징 체크 (기기 fingerprint + IP 서브넷)
    const fingerprint = generateServerFingerprint(
      typeof userAgent === 'string' ? userAgent : String(req.headers['user-agent'] || ''),
      typeof language === 'string' ? language : String(req.headers['accept-language'] || '')
    );
    const abuseCheck = await checkAbuse(pool, { fingerprint, ipSubnet, email });
    if (abuseCheck.blocked) {
      return res.status(429).json({ error: abuseCheck.reason || '가입이 제한되었습니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // 초대 코드는 가입 즉시 발급한다(내 초대 링크를 바로 쓸 수 있게).
    let inviteCode: string | null = null;
    try {
      inviteCode = await generateInviteCode();
    } catch (codeErr) {
      console.error('초대 코드 생성 실패(가입은 계속):', codeErr);
    }
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, streak_repaired, invite_code) VALUES ($1, $2, $3, TRUE, $4) RETURNING id, username',
      [username, email, hashedPassword, inviteCode]
    );
    const user = result.rows[0];

    // 가입 축하 보상 + 가입 칭호
    let extraTokens = 0;
    try {
      await pool.query('UPDATE users SET rating = rating + $1, tokens = COALESCE(tokens, 0) + $2 WHERE id = $3', [
        WELCOME_RATING,
        WELCOME_TOKENS,
        user.id
      ]);
      await pool.query(
        `INSERT INTO rating_activity_logs (user_id, problem_id, activity_type, change_amount, before_rating, after_rating, description)
         SELECT $1, NULL, 'signup_bonus', $2, rating - $2, rating, '가입 축하 보너스' FROM users WHERE id = $1`,
        [user.id, WELCOME_RATING]
      );
      await pool.query(
        "INSERT INTO user_titles (user_id, title_id) SELECT $1, title_id FROM titles WHERE title_id = 'welcome' ON CONFLICT DO NOTHING",
        [user.id]
      );
    } catch (bonusErr) {
      console.error('가입 보상 실패(가입은 계속):', bonusErr);
    }

    // 초대 코드로 들어왔으면 양쪽에 보상을 준다
    if (typeof ref === 'string' && ref.trim()) {
      try {
        const inviterRes = await pool.query('SELECT id, username FROM users WHERE invite_code = $1', [
          ref.trim().toUpperCase()
        ]);
        const inviter = inviterRes.rows[0];
        if (inviter && Number(inviter.id) !== Number(user.id)) {
          extraTokens += REFERRAL_TOKENS;
          await pool.query('UPDATE users SET referred_by = $1, tokens = COALESCE(tokens, 0) + $2 WHERE id = $3', [
            inviter.id,
            REFERRAL_TOKENS,
            user.id
          ]);
          await pool.query(
            'UPDATE users SET tokens = COALESCE(tokens, 0) + $1, referral_count = COALESCE(referral_count, 0) + 1 WHERE id = $2',
            [REFERRAL_TOKENS, inviter.id]
          );
          await pool.query(
            'INSERT INTO admin_notifications (type, message, from_user_id, from_username, related_id) VALUES ($1, $2, $3, $4, $5)',
            [
              'referral',
              `${inviter.username}님의 초대 링크로 ${username}님이 가입했습니다. 양쪽 토큰 +${REFERRAL_TOKENS}`,
              user.id,
              username,
              inviter.id
            ]
          );
        }
      } catch (refErr) {
        console.error('초대 보상 실패(가입은 계속):', refErr);
      }
    }

    // 3. 가입 기록 저장 (다중계정 추적용)
    try {
      await recordFingerprint(pool, {
        visitorId: fingerprint,
        ipSubnet,
        userAgent: String(req.headers['user-agent'] || ''),
        userId: user.id,
      });
    } catch (fpErr) {
      console.error('Fingerprint 기록 실패:', fpErr);
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({
      token,
      welcome: { rating: WELCOME_RATING, tokens: WELCOME_TOKENS, referralTokens: extraTokens },
      user: {
        id: user.id,
        username: user.username,
        invite_code: inviteCode,
        rating: WELCOME_RATING,
        tier: 'Bronze',
        streak: 0,
        xp: 0,
        tokens: WELCOME_TOKENS + extraTokens,
        level: 1,
        problems_solved: 0,
        equipped_title: '',
        custom_title: ''
      }
    });
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.post('/api/auth/login', loginRateLimit, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const client = await pool.connect();
  try {
    const userResult = await client.query('SELECT * FROM users WHERE email = $1 OR username = $1', [email]);
    const user = userResult.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      client.release();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Look up equipped title display name
    let equippedTitleName = '';
    if (user.equipped_title) {
      const titleRes = await pool.query('SELECT name FROM titles WHERE title_id = $1', [user.equipped_title]);
      if (titleRes.rows.length > 0) equippedTitleName = titleRes.rows[0].name;
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });

    const rating = parseFloat(user.rating) || 0;
    const tier = getTier(rating);

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        profile_image_url: user.profile_image_url,
        bio: user.bio,
        can_generate_problems: user.can_generate_problems,
        problems_solved: parseInt(user.problems_solved) || 0,
        equipped_title: equippedTitleName || user.equipped_title,
        has_firework_effect: user.has_firework_effect,
        has_developer_chango: user.has_developer_chango,
        custom_title: user.custom_title || '',
        rating,
        tier,
        streak: parseInt(user.streak) || 0,
        longest_streak: parseInt(user.longest_streak) || 0,
        xp: parseInt(user.xp) || 0,
        tokens: parseInt(user.tokens) || 0,
        level: Math.floor(Math.sqrt((parseInt(user.xp) || 0) / 100)) + 1,
        profile_theme: user.profile_theme || 'default',
        profile_css: user.profile_css || ''
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  } finally {
    client.release();
  }
});

app.get('/api/users/profile', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    const userResult = await pool.query(
      "SELECT id, username, email, profile_image_url, bio, can_generate_problems, equipped_title, created_at, has_firework_effect, has_developer_chango, custom_title, problems_solved, tokens, profile_theme, profile_css FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    let equippedTitleName = '';
    if (user.equipped_title) {
      const titleRes = await pool.query('SELECT name FROM titles WHERE title_id = $1', [user.equipped_title]);
      if (titleRes.rows.length > 0) equippedTitleName = titleRes.rows[0].name;
    }

    const statsResult = await pool.query(
      'SELECT COUNT(*) as total FROM submissions WHERE user_id = $1',
      [userId]
    );
    const stats = statsResult.rows[0];
    const totalSubmissions = parseInt(stats.total);
    const correctSubmissions = parseInt(user.problems_solved) || 0;

    const boxesRes = await pool.query(
      'SELECT box_id, count FROM user_reward_boxes WHERE user_id = $1 AND count > 0',
      [userId]
    );

    const badgesRes = await pool.query(
      'SELECT badge_id FROM user_profile_badges WHERE user_id = $1',
      [userId]
    );

    res.json({
      user: {
        ...user,
        equipped_title: equippedTitleName
      },
      stats: {
        totalSubmissions,
        correctSubmissions,
        accuracy: totalSubmissions > 0 ? (correctSubmissions / totalSubmissions) * 100 : 0
      },
      boxes: boxesRes.rows,
      badges: badgesRes.rows.map((r: any) => r.badge_id),
    });
  } catch (err) {
    console.error('Failed to fetch profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.post('/api/users/profile-image', authenticateToken, (req: any, res: Response) => {
  upload.single('profileImage')(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || 'Failed to upload profile image' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Profile image file is required' });
    }
    if (req.file.size > UPLOADED_IMAGE_MAX_BYTES) {
      return res.status(413).json({ error: '이미지는 3MB 이하만 올릴 수 있습니다.' });
    }

    const userId = req.user.id;

    try {
      // Vercel에서는 파일시스템이 없어(req.file.filename도 없음) 이미지를 DB에 넣고 토큰으로 서빙한다.
      const stored = await storeUploadedImage(userId, req.file, 'profile');
      const profileImageUrl = `/api/images/${stored.token}`;

      await pool.query('UPDATE users SET profile_image_url = $1 WHERE id = $2', [profileImageUrl, userId]);
      // 바꿀 때마다 쌓이지 않도록 이전 프로필 이미지는 지운다.
      await pool.query(
        "DELETE FROM uploaded_images WHERE created_by = $1 AND scope = 'profile' AND token <> $2",
        [userId, stored.token]
      );

      res.json({ message: 'Profile image updated successfully', profileImageUrl });
    } catch (err: any) {
      console.error('프로필 이미지 업로드 실패:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Failed to update profile image' });
    }
  });
});

app.patch('/api/users/profile', authenticateToken, profileRateLimit, async (req: any, res: Response) => {
  const { username, bio } = req.body;
  const userId = req.user.id;

  try {
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (typeof username === 'string' && username.trim()) {
      const nextUsername = username.trim();
      const nameCheck = isValidUsername(nextUsername);
      if (!nameCheck.ok) {
        return res.status(400).json({ error: nameCheck.error });
      }
      const existingUser = await pool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [nextUsername, userId]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      updates.push(`username = $${idx++}`);
      params.push(nextUsername);
    }

    if (typeof bio === 'string') {
      const bioCheck = validateBio(bio);
      if (!bioCheck.ok) {
        return res.status(400).json({ error: bioCheck.error });
      }
      updates.push(`bio = $${idx++}`);
      params.push(bioCheck.clean);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No profile fields provided' });
    }

    params.push(userId);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, bio, profile_image_url`,
      params
    );

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.get('/api/users/search', async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    const result = await pool.query(
      "SELECT id, username, profile_image_url, bio, equipped_title, custom_title, rating FROM users WHERE username ILIKE $1 ORDER BY id DESC LIMIT 10",
      [`%${q}%`]
    );
    const titleIds = [...new Set(result.rows.filter((r: any) => r.equipped_title).map((r: any) => r.equipped_title))];
    const titleMap: Record<string, string> = {};
    if (titleIds.length > 0) {
      const titleRes = await pool.query('SELECT title_id, name FROM titles WHERE title_id = ANY($1)', [titleIds]);
      for (const row of titleRes.rows) {
        titleMap[row.title_id] = row.name;
      }
    }
    const users = result.rows.map((u: any) => ({
      ...u,
      rating: parseFloat(u.rating) || 0,
      tier: getTier(parseFloat(u.rating) || 0),
      equipped_title: u.equipped_title ? (titleMap[u.equipped_title] || u.equipped_title) : '',
      custom_title: u.custom_title || ''
    }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// --- Store API ---
// --- Store API Endpoints ---
// List available store items
app.get('/api/store/items', authenticateToken, async (req: any, res: Response) => {
  const items = [
    {
      id: 'firework_effect',
      name: '폭죽 이펙트',
      cost: 100,
      description: '정답 시 화면 중앙에서 폭죽 파티클 이펙트가 재생됩니다.'
    },
    {
      id: 'developer_chango',
      name: '개발자의 칭호',
      cost: 500,
      description: '구매 후 프로필에서 원하는 맞춤형 칭호 문구를 관리자에게 전송하세요!'
    },
    {
      id: 'fever_2x',
      name: '2배 피버타임 (2분)',
      cost: 100,
      description: '2분 동안 획득 레이팅이 2배로 증가합니다!'
    },
    {
      id: 'fever_5x',
      name: '5배 피버타임 (5분)',
      cost: 500,
      description: '5분 동안 획득 레이팅이 5배로 증가합니다!'
    }
  ];
  res.json({ items });
});
// Exchange RP for integer tokens. Only the RP needed for whole tokens is charged,
// so the fractional token remainder from the progressive calculation is not lost.
app.post('/api/store/exchange-rp', authenticateToken, async (
  req: Request<Record<string, string>, unknown, { rp?: unknown }>,
  res: Response,
) => {
  // authenticateToken이 주입한 인증 사용자 ID만 사용한다.
  const authenticatedRequest = req as Request & { user: { id: number } };
  const userId = authenticatedRequest.user.id;
  const requestedRp = req.body?.rp;
  if (typeof requestedRp !== 'number' || !Number.isSafeInteger(requestedRp) || requestedRp < MIN_EXCHANGE_RP) {
    return res.status(400).json({ error: '환전 RP는 5,000 이상의 안전한 정수여야 합니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query(
      'SELECT username, rating, tokens FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];
    if (user.username === 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: '관리자 계정은 RP를 환전할 수 없습니다.' });
    }

    const currentRp = Number(user.rating);
    const currentTokens = Number(user.tokens);
    if (!Number.isFinite(currentRp) || currentRp < 0 || !Number.isSafeInteger(currentTokens) || currentTokens < 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: '사용자 잔액을 확인할 수 없습니다.' });
    }
    if (requestedRp > currentRp) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '보유 RP보다 많이 환전할 수 없습니다.' });
    }

    const quote = calculateExchangeQuote(requestedRp);
    if (quote.exchangedRp > currentRp || quote.tokensReceived < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '환전 가능한 RP가 부족합니다.' });
    }
    if (!canReceiveTokens(currentTokens, quote.tokensReceived)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `토큰 잔액 한도를 초과합니다. (최대 ${MAX_TOKEN_BALANCE.toLocaleString()} 토큰)` });
    }

    const updatedRes = await client.query(
      `UPDATE users
       SET rating = rating - $1::double precision,
           tokens = tokens + $2::integer
       WHERE id = $3
       RETURNING rating, tokens`,
      [quote.exchangedRp, quote.tokensReceived, userId],
    );
    if (updatedRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: '잔액이 변경되었습니다. 다시 시도해주세요.' });
    }

    await client.query('COMMIT');
    const updated = updatedRes.rows[0];
    const remainingRp = Number(updated.rating);
    const tokenBalance = Number(updated.tokens);
    return res.json({
      exchangedRp: quote.exchangedRp,
      tokensReceived: quote.tokensReceived,
      bonusTokens: quote.bonusTokens,
      remainingRp,
      tokenBalance,
      tier: getTier(remainingRp),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('RP exchange error:', err);
    return res.status(500).json({ error: 'RP 환전 중 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});




// Purchase firework effect item
app.post('/api/store/buy-firework-effect', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query('SELECT tokens, has_firework_effect FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];
    if (user.has_firework_effect) {
      client.release();
      return res.status(400).json({ error: '이미 보유 중인 아이템입니다.' });
    }
    if (user.tokens < 100) {
      client.release();
      return res.status(400).json({ error: '토큰이 부족합니다. (필요: 100 토큰)' });
    }
    await client.query(
      'UPDATE users SET tokens = tokens - 100, has_firework_effect = TRUE WHERE id = $1',
      [userId]
    );
    await client.query('COMMIT');
    res.json({ message: '폭죽 이펙트를 구매했습니다.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: '상점 구매 중 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

// Purchase developer title item
app.post('/api/store/buy-developer-chango', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query('SELECT tokens, has_developer_chango FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];
    if (user.has_developer_chango) {
      client.release();
      return res.status(400).json({ error: '이미 보유 중인 아이템입니다.' });
    }
    if (user.tokens < 500) {
      client.release();
      return res.status(400).json({ error: '토큰이 부족합니다. (필요: 500 토큰)' });
    }
    await client.query(
      'UPDATE users SET tokens = tokens - 500, has_developer_chango = TRUE WHERE id = $1',
      [userId]
    );
    await client.query('COMMIT');
    res.json({ message: '개발자의 칭호를 구매했습니다! 프로필에서 맞춤형 칭호를 입력하세요.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: '상점 구매 중 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

// Purchase fever time
app.post('/api/store/buy-fever', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const { type } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query('SELECT tokens, fever_multiplier, fever_expires_at FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];

    // Define fever types
    const feverTypes: Record<string, { cost: number; multiplier: number; durationMs: number }> = {
      fever_2x: { cost: 100, multiplier: 2, durationMs: 2 * 60 * 1000 },
      fever_5x: { cost: 500, multiplier: 5, durationMs: 5 * 60 * 1000 },
    };

    const fever = feverTypes[type];
    if (!fever) {
      client.release();
      return res.status(400).json({ error: '올바르지 않은 피버타임 유형입니다.' });
    }

    // Check if fever is already active
    if (user.fever_expires_at) {
      const now = new Date();
      const expiresAt = new Date(user.fever_expires_at);
      if (expiresAt > now) {
        client.release();
        return res.status(400).json({ error: '이미 피버타임이 활성화되어 있습니다.' });
      }
    }

    if (user.tokens < fever.cost) {
      client.release();
      return res.status(400).json({ error: `토큰이 부족합니다. (필요: ${fever.cost} 토큰)` });
    }

    const expiresAt = new Date(Date.now() + fever.durationMs);
    await client.query(
      'UPDATE users SET tokens = tokens - $1, fever_multiplier = $2, fever_expires_at = $3 WHERE id = $4',
      [fever.cost, fever.multiplier, expiresAt, userId]
    );
    await client.query('COMMIT');
    res.json({ message: `${fever.multiplier}배 피버타임이 활성화되었습니다! (${fever.durationMs / 60000}분)`, fever_multiplier: fever.multiplier, fever_expires_at: expiresAt.toISOString() });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: '상점 구매 중 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

// Submit custom title from developer chango
app.post('/api/store/submit-custom-title', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const { customTitle } = req.body;
  if (!customTitle || typeof customTitle !== 'string' || customTitle.trim().length === 0) {
    return res.status(400).json({ error: '칭호 문구를 입력해주세요.' });
  }
  if (customTitle.trim().length > 50) {
    return res.status(400).json({ error: '칭호는 50자 이내로 입력해주세요.' });
  }
  try {
    const userRes = await pool.query('SELECT username, has_developer_chango FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];
    if (!user.has_developer_chango) {
      return res.status(403).json({ error: '개발자의 칭호 아이템을 보유하고 있어야 합니다.' });
    }
    await pool.query(
      `INSERT INTO admin_notifications (type, message, from_user_id, from_username) VALUES ($1, $2, $3, $4)`,
      ['custom_title_request', `${user.username}님이 맞춤형 칭호를 요청했습니다: "${customTitle.trim()}"`, userId, user.username]
    );
    res.json({ message: '맞춤형 칭호 요청이 전송되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '칭호 전송 중 오류가 발생했습니다.' });
  }
});

app.get('/api/users/:id/profile', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const userResult = await pool.query(
      "SELECT id, username, profile_image_url, bio, equipped_title, has_firework_effect, has_developer_chango, custom_title, problems_solved, rating, created_at, profile_theme, profile_css FROM users WHERE id = $1",
      [id]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];
    let equippedTitleName = '';
    if (user.equipped_title) {
      const titleRes = await pool.query('SELECT name FROM titles WHERE title_id = $1', [user.equipped_title]);
      if (titleRes.rows.length > 0) equippedTitleName = titleRes.rows[0].name;
    }
    const titlesRes = await pool.query(
      'SELECT t.title_id, t.name, t.description FROM user_titles ut JOIN titles t ON t.title_id = ut.title_id WHERE ut.user_id = $1 ORDER BY ut.unlocked_at',
      [id]
    );
    const statsResult = await pool.query(
      'SELECT COUNT(*) as total FROM submissions WHERE user_id = $1',
      [id]
    );
    const stats = statsResult.rows[0];
    const totalSubmissions = parseInt(stats.total);
    const correctSubmissions = parseInt(user.problems_solved) || 0;
    res.json({
      user: {
        ...user,
        rating: parseFloat(user.rating) || 0,
        tier: getTier(parseFloat(user.rating) || 0),
        equipped_title: equippedTitleName || user.equipped_title
      },
      titles: titlesRes.rows,
      stats: {
        totalSubmissions,
        correctSubmissions,
        accuracy: totalSubmissions > 0 ? (correctSubmissions / totalSubmissions) * 100 : 0
      }
    });
  } catch (err) {
    console.error('Failed to fetch public profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});


// Admin creates a custom problem with rating reward
// User streak history (daily solved count) with offset support
app.get('/api/users/:id/streak-history', async (req: Request, res: Response) => {
  const { id } = req.params;
  const offset = parseInt(req.query.offset as string) || 0;
  try {
    // Calculate 6-month window, shifted by `offset` (0 = current, 1 = previous, etc.)
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1 - offset * 6, 0, 23, 59, 59, 999);
    const monthStart = new Date(monthEnd);
    monthStart.setMonth(monthStart.getMonth() - 5);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const result = await pool.query(
      `SELECT to_char(submitted_at::date, 'YYYY-MM-DD') as date, COUNT(*) as solved,
              bool_or(is_streak_repair) as has_repair
       FROM submissions WHERE user_id = $1 AND is_correct = true
       AND submitted_at >= $2 AND submitted_at <= $3
       GROUP BY date ORDER BY date`,
      [id, monthStart.toISOString(), monthEnd.toISOString()]
    );
    res.json({ history: result.rows, fromDate: monthStart.toISOString(), toDate: monthEnd.toISOString() });
  } catch (err) {
    console.error('Failed to fetch streak history:', err);
    res.status(500).json({ error: 'Failed to fetch streak history' });
  }
});

// --- Title Endpoints ---

app.get('/api/titles', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  try {
    const titlesResult = await pool.query('SELECT * FROM titles ORDER BY id');
    const userTitlesResult = await pool.query('SELECT title_id FROM user_titles WHERE user_id = $1', [userId]);
    const userTitleIds = new Set(userTitlesResult.rows.map((r: any) => r.title_id));
    const titleStatResult = await pool.query(
      'SELECT COUNT(*) as correct_count FROM submissions WHERE user_id = $1 AND is_correct = true',
      [userId]
    );
    const correctCount = parseInt(titleStatResult.rows[0].correct_count);
    const userResult = await pool.query('SELECT streak, equipped_title FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const equippedTitle = user?.equipped_title || '';

    const titles = titlesResult.rows.map((t: any) => ({
      ...t,
      unlocked: userTitleIds.has(t.title_id),
      equipped: equippedTitle === t.title_id,
      progress: correctCount
    }));

    res.json({ titles, equippedTitle, correctCount, streak: user?.streak || 0 });
  } catch (err) {
    console.error('Failed to fetch titles:', err);
    res.status(500).json({ error: 'Failed to fetch titles' });
  }
});

app.post('/api/titles/check', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const { action, value } = req.body;
  const client = await pool.connect();
  try {
    // Get user info for checks
    const userRes = await client.query(
      'SELECT streak, equipped_title FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];

    // Get correct submission count
    const statsRes = await client.query(
      'SELECT COUNT(*) as count FROM submissions WHERE user_id = $1 AND is_correct = true',
      [userId]
    );
    const correctCount = parseInt(statsRes.rows[0].count);

    // Current consecutive-correct combo, calculated from trusted submission history.
    const recentComboSubmissionsRes = await client.query(
      'SELECT is_correct FROM submissions WHERE user_id = $1 ORDER BY submitted_at DESC, id DESC LIMIT 100',
      [userId]
    );
    let consecutiveCorrect = 0;
    for (const row of recentComboSubmissionsRes.rows) {
      if (!row.is_correct) break;
      consecutiveCorrect++;
    }

    // Get ranking position (exclude admin)
    const rankRes = await client.query(
      "SELECT id FROM users WHERE username != 'admin' ORDER BY rating DESC"
    );
    let userRank = -1;
    for (let i = 0; i < rankRes.rows.length; i++) {
      if (rankRes.rows[i].id === userId) { userRank = i + 1; break; }
    }

    // Get all titles
    const titlesRes = await client.query('SELECT * FROM titles');
    const titles = titlesRes.rows;

    // Get already unlocked titles
    const userTitlesRes = await client.query('SELECT title_id FROM user_titles WHERE user_id = $1', [userId]);
    const unlockedSet = new Set(userTitlesRes.rows.map((r: any) => r.title_id));

    const newlyUnlocked: any[] = [];

    for (const title of titles) {
      if (unlockedSet.has(title.title_id)) continue;
      let shouldUnlock = false;

      const userInfo = await client.query(
        'SELECT tokens, xp, referral_count FROM users WHERE id = $1',
        [userId]
      );
      const u = userInfo.rows[0];
      const totalSubRes = await client.query(
        'SELECT COUNT(*) as cnt FROM submissions WHERE user_id = $1',
        [userId]
      );
      const totalSubs = parseInt(totalSubRes.rows[0].cnt) || 0;
      const overallAccuracy = totalSubs > 0 ? Math.round((correctCount / totalSubs) * 100) : 0;

      switch (title.condition_type) {
        case 'referrals':
          if ((u.referral_count || 0) >= title.condition_value) shouldUnlock = true;
          break;
        case 'goose_room':
          if (action === 'goose_room') shouldUnlock = true;
          break;
        case 'cat_room':
          if (action === 'cat_room') shouldUnlock = true;
          break;
        case 'dark_mode':
          if (action === 'dark_mode' && value >= title.condition_value) shouldUnlock = true;
          break;
        case 'culture_language':
          if (action === 'culture_language' && value >= title.condition_value) shouldUnlock = true;
          break;
        case 'solve_count':
          if (correctCount >= title.condition_value) shouldUnlock = true;
          break;
        case 'streak':
          if ((user.streak || 0) >= title.condition_value) shouldUnlock = true;
          break;
        case 'ranking':
          if (userRank > 0 && userRank <= title.condition_value) shouldUnlock = true;
          break;
        case 'accuracy':
          if (overallAccuracy >= title.condition_value) shouldUnlock = true;
          break;
        case 'tokens':
          if ((u.tokens || 0) >= title.condition_value) shouldUnlock = true;
          break;
        case 'xp':
          if ((u.xp || 0) >= title.condition_value) shouldUnlock = true;
          break;
        case 'consecutive_correct':
          if (consecutiveCorrect >= title.condition_value) shouldUnlock = true;
          break;
      }

      if (shouldUnlock) {
        await client.query(
          'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, title.title_id]
        );
        newlyUnlocked.push({ title_id: title.title_id, name: title.name, description: title.description });
      }
    }

    // 상자깡 칭호(개봉 횟수 / 전설 개봉 / 연속 개봉)는 여기서도 확인한다.
    for (const t of await unlockBoxTitles(client, userId)) {
      if (!newlyUnlocked.some((x: any) => x.title_id === t.title_id)) newlyUnlocked.push(t);
    }

    res.json({ newlyUnlocked, correctCount, streak: user.streak, rank: userRank, consecutiveCorrect });
  } catch (err) {
    console.error('Failed to check titles:', err);
    res.status(500).json({ error: 'Failed to check titles' });
  } finally {
    client.release();
  }
});

app.post('/api/titles/equip', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const { titleId } = req.body;

  if (!titleId) {
    return res.status(400).json({ error: 'titleId is required' });
  }

  try {
    if (titleId === 'none') {
      await pool.query("UPDATE users SET equipped_title = '' WHERE id = $1", [userId]);
      return res.json({ message: '칭호를 해제했습니다.', equippedTitle: '' });
    }

    // Check if user owns this title
    const ownedRes = await pool.query(
      'SELECT 1 FROM user_titles WHERE user_id = $1 AND title_id = $2',
      [userId, titleId]
    );
    if (ownedRes.rows.length === 0) {
      return res.status(403).json({ error: '보유하지 않은 칭호입니다.' });
    }

    await pool.query('UPDATE users SET equipped_title = $1 WHERE id = $2', [titleId, userId]);
    const titleRes = await pool.query('SELECT name FROM titles WHERE title_id = $1', [titleId]);
    const equippedTitleName = titleRes.rows.length > 0 ? titleRes.rows[0].name : titleId;
    res.json({ message: '칭호를 장착했습니다.', equippedTitle: titleId, equippedTitleName });
  } catch (err) {
    console.error('Failed to equip title:', err);
    res.status(500).json({ error: 'Failed to equip title' });
  }
});

// Group Endpoints
app.get('/api/groups', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let userId: number | null = null;

  if (token) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch (err) { }
  }

  try {
    const query = `
      SELECT g.*, u.username as creator_name, COUNT(gm.user_id) as member_count,
             EXISTS(SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = $1) as is_member,
             EXISTS(SELECT 1 FROM group_join_requests WHERE group_id = g.id AND user_id = $1 AND status = 'pending') as is_pending
      FROM groups g
      LEFT JOIN users u ON g.creator_id = u.id
      LEFT JOIN group_members gm ON g.id = gm.group_id
      GROUP BY g.id, u.username
      ORDER BY g.created_at DESC
    `;
    const result = await pool.query(query, [userId || null]);
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch groups:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

app.post('/api/groups', authenticateToken, async (req: any, res: Response) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  try {
    // Check if user is Silver or higher (Rating >= 100,000)
    const userRes = await pool.query('SELECT rating FROM users WHERE id = $1', [userId]);
    const rating = parseFloat(userRes.rows[0].rating);

    if (rating < 100000) {
      return res.status(403).json({ error: 'Only Silver tier (Rating 100,000+) can create groups' });
    }

    // Check group creation limit (Max 2)
    const countRes = await pool.query('SELECT COUNT(*) FROM groups WHERE creator_id = $1', [userId]);
    if (parseInt(countRes.rows[0].count) >= 2) {
      return res.status(403).json({ error: 'You can only create up to 2 groups' });
    }

    const groupResult = await pool.query(
      'INSERT INTO groups (name, description, creator_id) VALUES ($1, $2, $3) RETURNING id',
      [name, description, userId]
    );
    const groupId = groupResult.rows[0].id;

    // Creator automatically joins the group
    await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [groupId, userId]);

    res.status(201).json({ message: 'Group created successfully', groupId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.get('/api/groups/:id', async (req: Request, res: Response) => {
  const groupId = req.params.id;
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let userId: number | null = null;

  if (token) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch (err) { }
  }

  try {
    const groupResult = await pool.query(`
      SELECT g.*, u.username as creator_name,
             EXISTS(SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = $1) as is_member,
             EXISTS(SELECT 1 FROM group_join_requests WHERE group_id = g.id AND user_id = $1 AND status = 'pending') as is_pending
      FROM groups g
      JOIN users u ON g.creator_id = u.id
      WHERE g.id = $2
    `, [userId || null, groupId]);

    if (groupResult.rows.length === 0) return res.status(404).json({ error: 'Group not found' });

    const membersResult = await pool.query(`
      SELECT u.id, u.username, u.rating, u.profile_image_url
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = $1
    `, [groupId]);

    res.json({
      ...groupResult.rows[0],
      members: membersResult.rows.map(m => ({ ...m, tier: getTier(m.rating) }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group details' });
  }
});

app.post('/api/groups/:id/join', authenticateToken, async (req: any, res: Response) => {
  const groupId = req.params.id;
  const userId = req.user.id;

  try {
    // Check if already a member
    const memberCheck = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    if (memberCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    // Check if already has a pending request
    const requestCheck = await pool.query('SELECT 1 FROM group_join_requests WHERE group_id = $1 AND user_id = $2 AND status = \'pending\'', [groupId, userId]);
    if (requestCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Join request already sent and pending' });
    }

    await pool.query('INSERT INTO group_join_requests (group_id, user_id) VALUES ($1, $2)', [groupId, userId]);
    res.json({ message: 'Join request sent successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send join request' });
  }
});

app.post('/api/groups/:id/leave', authenticateToken, async (req: any, res: Response) => {
  const groupId = req.params.id;
  const userId = req.user.id;

  try {
    await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    res.json({ message: 'Left group successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

// Group Competition Endpoints
app.post('/api/groups/:id/competitions', authenticateToken, async (req: any, res: Response) => {
  const groupId = req.params.id;
  const { title, description, durationHours } = req.body;
  const userId = req.user.id;

  if (!title || !durationHours) {
    return res.status(400).json({ error: 'Title and duration are required' });
  }

  const hours = parseInt(durationHours);
  if (isNaN(hours) || hours <= 0) {
    return res.status(400).json({ error: 'Duration must be a positive integer' });
  }

  try {
    // Check if user is a member of the group
    const memberCheck = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only group members can create competitions' });
    }

    await pool.query('BEGIN');

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + hours * 60 * 60 * 1000);
    
    const compResult = await pool.query(
      'INSERT INTO group_competitions (group_id, title, description, duration_hours, start_time, end_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [groupId, title, description || null, hours, startTime, endTime]
    );
    const competition = compResult.rows[0];

    // Fetch all current group members and their ratings
    const membersRes = await pool.query(`
      SELECT gm.user_id, u.rating 
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = $1
    `, [groupId]);

    // Insert participants with current ratings
    for (const member of membersRes.rows) {
      await pool.query(
        'INSERT INTO group_competition_participants (competition_id, user_id, initial_rating) VALUES ($1, $2, $3)',
        [competition.id, member.user_id, member.rating]
      );
    }

    await pool.query('COMMIT');
    res.status(201).json({ message: 'Competition created successfully', competition });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Failed to create competition:', err);
    res.status(500).json({ error: 'Failed to create competition' });
  }
});

app.get('/api/groups/:id/competitions', authenticateToken, async (req: any, res: Response) => {
  const groupId = req.params.id;
  const userId = req.user.id;

  try {
    // Check if user is a member of the group
    const memberCheck = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only group members can view competitions' });
    }

    const compsRes = await pool.query(`
      SELECT 
        gc.*,
        CASE 
          WHEN NOW() < gc.start_time THEN 'pending'
          WHEN NOW() BETWEEN gc.start_time AND gc.end_time THEN 'ongoing'
          ELSE 'ended'
        END as status,
        (SELECT COUNT(*) FROM group_competition_participants WHERE competition_id = gc.id) as participant_count
      FROM group_competitions gc
      WHERE gc.group_id = $1
      ORDER BY gc.created_at DESC
    `, [groupId]);

    res.json(compsRes.rows);
  } catch (err) {
    console.error('Failed to fetch competitions:', err);
    res.status(500).json({ error: 'Failed to fetch competitions' });
  }
});

app.get('/api/groups/:id/competitions/:compId', authenticateToken, async (req: any, res: Response) => {
  const groupId = req.params.id;
  const compId = req.params.compId;
  const userId = req.user.id;

  try {
    // Check if user is a member of the group
    const memberCheck = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only group members can access this competition' });
    }

    // Check if competition exists
    const compRes = await pool.query('SELECT * FROM group_competitions WHERE id = $1 AND group_id = $2', [compId, groupId]);
    if (compRes.rows.length === 0) {
      return res.status(404).json({ error: 'Competition not found' });
    }
    const competition = compRes.rows[0];

    // Check if current user is registered as a participant, if not, auto-register
    const participantCheck = await pool.query(
      'SELECT 1 FROM group_competition_participants WHERE competition_id = $1 AND user_id = $2',
      [compId, userId]
    );
    if (participantCheck.rows.length === 0) {
      const userRatingRes = await pool.query('SELECT rating FROM users WHERE id = $1', [userId]);
      const currentRating = parseFloat(userRatingRes.rows[0].rating);
      await pool.query(
        'INSERT INTO group_competition_participants (competition_id, user_id, initial_rating) VALUES ($1, $2, $3)',
        [compId, userId, currentRating]
      );
    }

    // Fetch leaderboard
    const leaderboardRes = await pool.query(`
      SELECT 
        u.id as user_id,
        u.username,
        u.profile_image_url,
        gcp.initial_rating,
        u.rating as current_rating,
        (u.rating - gcp.initial_rating) as rating_gain
      FROM group_competition_participants gcp
      JOIN users u ON gcp.user_id = u.id
      WHERE gcp.competition_id = $1
      ORDER BY rating_gain DESC, u.rating DESC
    `, [compId]);

    const leaderboard = leaderboardRes.rows.map((row: any) => ({
      ...row,
      tier: getTier(parseFloat(row.current_rating))
    }));

    const now = new Date();
    const start = new Date(competition.start_time);
    const end = new Date(competition.end_time);
    let status = 'ended';
    if (now < start) status = 'pending';
    else if (now >= start && now <= end) status = 'ongoing';

    res.json({
      competition: {
        ...competition,
        status
      },
      leaderboard
    });
  } catch (err) {
    console.error('Failed to fetch competition leaderboard:', err);
    res.status(500).json({ error: 'Failed to fetch competition leaderboard' });
  }
});

// Group Join Requests Management
app.get('/api/groups/:id/requests', authenticateToken, async (req: any, res: Response) => {
  const groupId = req.params.id;
  const userId = req.user.id;

  try {
    // Check ownership
    const groupRes = await pool.query('SELECT creator_id FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found' });
    if (groupRes.rows[0].creator_id !== userId) return res.status(403).json({ error: 'Only group creator can view requests' });

    const requestsRes = await pool.query(`
      SELECT r.id, r.user_id, r.created_at, u.username, u.rating, u.profile_image_url
      FROM group_join_requests r
      JOIN users u ON r.user_id = u.id
      WHERE r.group_id = $1 AND r.status = 'pending'
      ORDER BY r.created_at ASC
    `, [groupId]);

    res.json(requestsRes.rows.map(r => ({ ...r, tier: getTier(r.rating) })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

app.post('/api/groups/:id/requests/:requestId/approve', authenticateToken, async (req: any, res: Response) => {
  const groupId = req.params.id;
  const requestId = req.params.requestId;
  const userId = req.user.id;

  try {
    // Check ownership
    const groupRes = await pool.query('SELECT creator_id FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rows[0].creator_id !== userId) return res.status(403).json({ error: 'Only group creator can approve requests' });

    // Get request details
    const requestRes = await pool.query('SELECT user_id FROM group_join_requests WHERE id = $1 AND group_id = $2', [requestId, groupId]);
    if (requestRes.rows.length === 0) return res.status(404).json({ error: 'Request not found' });

    const targetUserId = requestRes.rows[0].user_id;

    // Add to members and remove from requests
    await pool.query('BEGIN');
    await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [groupId, targetUserId]);
    await pool.query('DELETE FROM group_join_requests WHERE id = $1', [requestId]);
    await pool.query('COMMIT');

    res.json({ message: 'Request approved successfully' });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

app.post('/api/groups/:id/requests/:requestId/reject', authenticateToken, async (req: any, res: Response) => {
  const groupId = req.params.id;
  const requestId = req.params.requestId;
  const userId = req.user.id;

  try {
    // Check ownership
    const groupRes = await pool.query('SELECT creator_id FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rows[0].creator_id !== userId) return res.status(403).json({ error: 'Only group creator can reject requests' });

    await pool.query('DELETE FROM group_join_requests WHERE id = $1 AND group_id = $2', [requestId, groupId]);
    res.json({ message: 'Request rejected successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject request' });
  }
});


app.post('/api/users/change-password', authenticateToken, async (req: any, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new passwords are required' });
  }

  try {
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid current password' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedNewPassword, userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ===================== 주간 리그 =====================
// 정의: KST 기준 월요일 00:00 ~ 일요일 23:59 사이에 '정답으로 얻은 레이팅' 합계.
// 오답 패널티는 리그 점수에 넣지 않는다(열심히 도전한 사람이 불리해지지 않도록).
// 정산(지난 주 상위 3명 토큰 지급)은 별도 크론 없이 조회 시 지연 실행하고,
// weekly_league_rewards 마커 행으로 주차당 정확히 1번만 돌게 한다.
// 주간 리그 보상 규칙은 src/rating/leagueWinners.ts 에 있다(순수 함수라 테스트 가능).

const settleWeeklyLeague = async (): Promise<{ weekKey: string; winners: any[] } | null> => {
  const lastWeekKey = shiftWeekKey(getWeekKeyString(), -1);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 마커 INSERT가 곧 락이다. 이미 있으면 다른 요청이 정산 중이거나 끝난 것.
    const marker = await client.query(
      'INSERT INTO weekly_league_rewards (week_key) VALUES ($1) ON CONFLICT (week_key) DO NOTHING RETURNING week_key',
      [lastWeekKey]
    );
    if (marker.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const winnersRes = await client.query(
      `SELECT s.user_id, s.score, s.solved, u.username
       FROM weekly_league_scores s
       JOIN users u ON u.id = s.user_id
       WHERE s.week_key = $1
       ORDER BY s.score DESC, s.updated_at ASC
       LIMIT $2`,
      [lastWeekKey, LEAGUE_REWARD_TOKENS.length]
    );
    const winners = pickLeagueWinners<any>(winnersRes.rows);

    for (const winner of winners) {
      await client.query('UPDATE users SET tokens = COALESCE(tokens, 0) + $1 WHERE id = $2', [winner.tokens, winner.user_id]);
      await client.query(
        'INSERT INTO admin_notifications (type, message, from_user_id, from_username, related_id) VALUES ($1, $2, $3, $4, $5)',
        [
          'weekly_league',
          `주간 리그(${lastWeekKey} 시작 주차) ${winner.rank}위 ${winner.username} — ${Math.round(Number(winner.score)).toLocaleString('ko-KR')} RP 획득, 토큰 +${winner.tokens}`,
          null,
          '리그',
          winner.user_id
        ]
      );
    }

    await client.query('UPDATE weekly_league_rewards SET winners = $1::jsonb WHERE week_key = $2', [JSON.stringify(winners), lastWeekKey]);
    await client.query('COMMIT');
    return { weekKey: lastWeekKey, winners };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};

// 주간 리그 순위 + 내 순위 + 지난 주 결과. 비로그인도 조회 가능(내 순위만 빠짐).
app.get('/api/league', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let userId: number | null = null;
  if (token) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch (err) { /* 비로그인 취급 */ }
  }

  try {
    await settleWeeklyLeague();

    const weekKey = getWeekKeyString();
    const { start, end } = getWeekRange(weekKey);

    const topRes = await pool.query(
      `SELECT s.user_id AS id, u.username, u.profile_image_url, u.equipped_title, u.custom_title, u.rating,
              s.score, s.solved
       FROM weekly_league_scores s
       JOIN users u ON u.id = s.user_id
       WHERE s.week_key = $1
       ORDER BY s.score DESC, s.updated_at ASC
       LIMIT 50`,
      [weekKey]
    );

    let me: any = null;
    if (userId) {
      const meRes = await pool.query(
        'SELECT score, solved FROM weekly_league_scores WHERE user_id = $1 AND week_key = $2',
        [userId, weekKey]
      );
      if (meRes.rows.length > 0) {
        const aheadRes = await pool.query(
          'SELECT COUNT(*)::int AS ahead FROM weekly_league_scores WHERE week_key = $1 AND score > $2',
          [weekKey, meRes.rows[0].score]
        );
        me = { score: Number(meRes.rows[0].score), solved: Number(meRes.rows[0].solved), rank: aheadRes.rows[0].ahead + 1 };
      } else {
        me = { score: 0, solved: 0, rank: null };
      }
    }

    const lastWeekKey = shiftWeekKey(weekKey, -1);
    const lastRes = await pool.query(
      'SELECT winners, settled_at FROM weekly_league_rewards WHERE week_key = $1',
      [lastWeekKey]
    );

    res.json({
      weekKey,
      weekStart: start,
      weekEnd: end,
      top: topRes.rows,
      me,
      rewards: LEAGUE_REWARD_TOKENS,
      minScore: LEAGUE_MIN_SCORE,
      lastWeek: {
        weekKey: lastWeekKey,
        winners: lastRes.rows[0]?.winners || [],
        settled: lastRes.rows.length > 0
      }
    });
  } catch (error: any) {
    console.error('주간 리그 조회 실패:', error?.message || error);
    res.status(500).json({ error: '주간 리그를 불러오지 못했습니다.' });
  }
});

// 관리자: 지난 주 정산을 즉시 실행(이미 정산된 주차면 settled=null).
app.post('/api/admin/league/settle', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const result = await settleWeeklyLeague();
    res.json({ settled: result });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '정산에 실패했습니다.' });
  }
});

// 상자깡 칭호(개봉 횟수 / 전설 개봉 / 연속 개봉)를 확인해 새로 딴 칭호를 돌려준다.
const unlockBoxTitles = async (client: any, userId: number) => {
  const statsRes = await client.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE rarity = 'legendary')::int AS legendary
     FROM box_openings WHERE user_id = $1`,
    [userId]
  );
  const total = statsRes.rows[0]?.total || 0;
  const legendary = statsRes.rows[0]?.legendary || 0;

  // 상자깡 연속 개봉일: 오늘까지 거슬러 올라가며 하루도 빠지지 않은 날 수
  const streakRes = await client.query(
    `SELECT day_key FROM box_openings WHERE user_id = $1 ORDER BY day_key DESC LIMIT 400`,
    [userId]
  );
  const days = new Set(streakRes.rows.map((r: any) => String(r.day_key)));
  let boxStreak = 0;
  const cursor = new Date(`${getTodayString()}T00:00:00Z`);
  while (days.has(cursor.toISOString().split('T')[0])) {
    boxStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const titlesRes = await client.query(
    "SELECT * FROM titles WHERE condition_type IN ('box_openings', 'box_legendary', 'box_streak')"
  );
  const ownedRes = await client.query('SELECT title_id FROM user_titles WHERE user_id = $1', [userId]);
  const owned = new Set(ownedRes.rows.map((r: any) => r.title_id));

  const unlocked: any[] = [];
  for (const title of titlesRes.rows) {
    if (owned.has(title.title_id)) continue;
    const value =
      title.condition_type === 'box_openings' ? total : title.condition_type === 'box_legendary' ? legendary : boxStreak;
    if (value >= title.condition_value) {
      await client.query('INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
        userId,
        title.title_id
      ]);
      unlocked.push({ title_id: title.title_id, name: title.name, description: title.description });
    }
  }
  return unlocked;
};

// 오늘 상자 상태 + 등급표 + 기록
app.get('/api/box', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const today = getTodayString();
    const userRes = await pool.query('SELECT streak FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    const streak = userRes.rows[0].streak || 0;

    const todayRes = await pool.query(
      'SELECT rarity, rating_reward, token_reward, streak_at, upgraded, opened_at FROM box_openings WHERE user_id = $1 AND day_key = $2',
      [userId, today]
    );
    const historyRes = await pool.query(
      'SELECT day_key, rarity, rating_reward, token_reward, streak_at, upgraded FROM box_openings WHERE user_id = $1 ORDER BY day_key DESC LIMIT 10',
      [userId]
    );
    const statsRes = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE rarity = 'legendary')::int AS legendary,
              COALESCE(SUM(rating_reward), 0)::int AS rating_total,
              COALESCE(SUM(token_reward), 0)::int AS token_total
       FROM box_openings WHERE user_id = $1`,
      [userId]
    );
    const byRarityRes = await pool.query(
      'SELECT rarity, COUNT(*)::int AS count FROM box_openings WHERE user_id = $1 GROUP BY rarity',
      [userId]
    );

    const streakRes = await pool.query(
      'SELECT day_key FROM box_openings WHERE user_id = $1 ORDER BY day_key DESC LIMIT 400',
      [userId]
    );
    const daySet = new Set(streakRes.rows.map((r: any) => String(r.day_key)));
    let streakDays = 0;
    const cursor = new Date(`${today}T00:00:00Z`);
    while (daySet.has(cursor.toISOString().split('T')[0])) {
      streakDays += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    res.json({
      dayKey: today,
      streak,
      baseRarity: rarityForStreak(streak),
      upgradeChance: upgradeChance(streak),
      nextRarity: daysToNextRarity(streak),
      tiers: BOX_RARITY_ORDER.map((rarity) => ({ rarity, ...BOX_TIERS[rarity] })),
      openedToday: todayRes.rows[0] || null,
      boxStreak: streakDays,
      history: historyRes.rows,
      stats: {
        total: statsRes.rows[0]?.total || 0,
        legendary: statsRes.rows[0]?.legendary || 0,
        ratingTotal: statsRes.rows[0]?.rating_total || 0,
        tokenTotal: statsRes.rows[0]?.token_total || 0,
        byRarity: byRarityRes.rows
      }
    });
  } catch (err: any) {
    console.error('Failed to load box:', err);
    res.status(500).json({ error: '상자 정보를 불러오지 못했습니다.' });
  }
});

// 오늘 상자 개봉 — 보상은 서버가 정하고 서버가 지급한다
app.post('/api/box/open', authenticateToken, async (req: any, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const today = getTodayString();

    await client.query('BEGIN');
    const userRes = await client.query('SELECT streak FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    const streak = userRes.rows[0].streak || 0;
    const roll = rollDailyBox(streak);

    const inserted = await client.query(
      `INSERT INTO box_openings (user_id, day_key, rarity, rating_reward, token_reward, streak_at, upgraded)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, day_key) DO NOTHING
       RETURNING rarity, rating_reward, token_reward, streak_at, upgraded, opened_at`,
      [userId, today, roll.rarity, roll.ratingReward, roll.tokenReward, streak, roll.upgraded]
    );

    if (inserted.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: '오늘 상자는 이미 열었습니다. 내일 다시 만나요.' });
    }

    await client.query('UPDATE users SET rating = rating + $1, tokens = COALESCE(tokens, 0) + $2 WHERE id = $3', [
      roll.ratingReward,
      roll.tokenReward,
      userId
    ]);
    // 레이팅 변화 기록(활동 로그). 주간 리그 점수에는 넣지 않는다(daily_box는 백필/적립에서 제외).
    await client.query(
      `INSERT INTO rating_activity_logs (user_id, problem_id, activity_type, change_amount, before_rating, after_rating, description)
       SELECT $1, NULL, 'daily_box', $2, rating - $2, rating, $3 FROM users WHERE id = $1`,
      [userId, roll.ratingReward, `상자깡(${BOX_TIERS[roll.rarity].label})`]
    );

    const unlocked = await unlockBoxTitles(client, userId);
    const totals = await client.query('SELECT rating, tokens FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');

    res.json({
      dayKey: today,
      rarity: roll.rarity,
      baseRarity: roll.baseRarity,
      upgraded: roll.upgraded,
      tier: BOX_TIERS[roll.rarity],
      ratingReward: roll.ratingReward,
      tokenReward: roll.tokenReward,
      streakAt: streak,
      unlockedTitles: unlocked,
      rating: totals.rows[0]?.rating,
      tokens: totals.rows[0]?.tokens
    });
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* 롤백 실패는 무시 */
    }
    console.error('Failed to open box:', err);
    res.status(500).json({ error: '상자를 여는 데 실패했습니다.' });
  } finally {
    client.release();
  }
});

// ---------- 익명 체험(가입 없이 맛보기) ----------
// 가입 전 방문자가 빈 화면을 보지 않도록 3문제를 내주고, 채점은 서버가 하되 레이팅은 건드리지 않는다.
// 정답을 돌려주지 않고, 토큰에 담긴 문제만 채점하므로 이 경로로 정답을 캐낼 수 없다(탐색 차단).
const TRIAL_PROBLEM_COUNT = 3;

app.get('/api/trial/problems', trialRateLimit, async (_req: Request, res: Response) => {
  try {
    const rows = await pool.query(
      `SELECT id, title, content FROM problems
       WHERE (review_status IS NULL OR review_status = 'approved')
         AND created_by IS NULL
         AND answer IS NOT NULL AND content IS NOT NULL
       ORDER BY random() LIMIT $1`,
      [TRIAL_PROBLEM_COUNT]
    );
    if (rows.rows.length === 0) {
      return res.status(503).json({ error: '체험 문제를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.' });
    }
    const ids = rows.rows.map((row: any) => Number(row.id));
    const trialToken = jwt.sign({ trial: true, ids }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token: trialToken, problems: rows.rows });
  } catch (err: any) {
    console.error('체험 문제 조회 실패:', err);
    res.status(500).json({ error: '체험 문제를 불러오지 못했습니다.' });
  }
});

app.post('/api/trial/answer', trialRateLimit, async (req: Request, res: Response) => {
  try {
    const { token, problemId, answer } = req.body || {};
    if (!token || problemId === undefined || typeof answer !== 'string') {
      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: '체험이 만료되었습니다. 새로 시작해주세요.' });
    }
    if (!payload?.trial || !Array.isArray(payload.ids) || !payload.ids.map(Number).includes(Number(problemId))) {
      return res.status(400).json({ error: '체험 목록에 없는 문제입니다.' });
    }
    const problemRes = await pool.query('SELECT answer, content FROM problems WHERE id = $1', [problemId]);
    if (problemRes.rows.length === 0) {
      return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });
    }
    const isCorrect = checkAnswer(answer, problemRes.rows[0].answer, problemRes.rows[0].content || '');
    // 정답은 알려주지 않는다 — 체험은 맛보기고, 알려주면 그 문제를 그대로 베낄 수 있다.
    res.json({ isCorrect });
  } catch (err: any) {
    console.error('체험 채점 실패:', err);
    res.status(500).json({ error: '채점하지 못했습니다.' });
  }
});

// 내 초대 링크(없으면 이때 발급) + 초대 현황
app.get('/api/users/invite', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const userRes = await pool.query('SELECT invite_code, referral_count FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    let inviteCode = userRes.rows[0].invite_code as string | null;
    if (!inviteCode) {
      inviteCode = await generateInviteCode();
      await pool.query('UPDATE users SET invite_code = $1 WHERE id = $2', [inviteCode, userId]);
    }

    const invitedRes = await pool.query(
      'SELECT username, created_at FROM users WHERE referred_by = $1 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );
    res.json({
      inviteCode,
      referralCount: userRes.rows[0].referral_count || 0,
      referralTokens: REFERRAL_TOKENS,
      invited: invitedRes.rows
    });
  } catch (err: any) {
    console.error('초대 정보 조회 실패:', err);
    res.status(500).json({ error: '초대 정보를 불러오지 못했습니다.' });
  }
});

// 관리자: 이번 주 점수를 rating_activity_logs에서 한 번 채워 넣는다(기능 배포 이전 데이터 구제).
// 테이블/컬럼이 예상과 다르면 아무것도 하지 않고 이유만 돌려준다.
app.post('/api/admin/league/backfill', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const exists = await pool.query("SELECT to_regclass('public.rating_activity_logs') AS t");
    if (!exists.rows[0]?.t) return res.json({ backfilled: 0, reason: 'rating_activity_logs 테이블이 없습니다.' });

    const colsRes = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'rating_activity_logs'"
    );
    const cols: string[] = colsRes.rows.map((r: any) => r.column_name);
    const timeCol = ['created_at', 'submitted_at', 'occurred_at', 'logged_at'].find((c) => cols.includes(c));
    if (!cols.includes('user_id') || !cols.includes('change_amount') || !timeCol) {
      return res.json({ backfilled: 0, reason: `예상과 다른 스키마: ${cols.join(', ')}` });
    }

    const weekKey = getWeekKeyString();
    const { start, end } = getWeekRange(weekKey);
    const result = await pool.query(
      `INSERT INTO weekly_league_scores (user_id, week_key, score, solved, updated_at)
       SELECT user_id, $1, SUM(GREATEST(change_amount, 0))::bigint, COUNT(*), NOW()
       FROM rating_activity_logs
       WHERE ${timeCol} >= $2 AND ${timeCol} < $3 AND change_amount > 0
         AND activity_type NOT IN ('daily_box', 'signup_bonus')  -- 상자깡·가입 보상은 주간 리그 점수가 아니다
       GROUP BY user_id
       ON CONFLICT (user_id, week_key) DO UPDATE SET
         score = EXCLUDED.score, solved = EXCLUDED.solved, updated_at = NOW()`,
      [weekKey, start, end]
    );
    res.json({ backfilled: result.rowCount, weekKey, timeColumn: timeCol, reason: null });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '채우기에 실패했습니다.' });
  }
});

app.get('/api/users/ranking', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, username, rating, profile_image_url, equipped_title, custom_title FROM users WHERE username != 'admin' ORDER BY rating DESC LIMIT 50"
    );
    // Resolve equipped title display names
    const titleIds = [...new Set(result.rows.filter((r: any) => r.equipped_title).map((r: any) => r.equipped_title))];
    const titleMap: Record<string, string> = {};
    if (titleIds.length > 0) {
      const titleRes = await pool.query('SELECT title_id, name FROM titles WHERE title_id = ANY($1)', [titleIds]);
      for (const row of titleRes.rows) titleMap[row.title_id] = row.name;
    }
    const users = result.rows.map(u => ({
      ...u,
      equipped_title: u.equipped_title ? (titleMap[u.equipped_title] || u.equipped_title) : '',
      tier: getTier(u.rating)
    }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ranking' });
  }
});

app.get('/api/stats/overview', async (_req: Request, res: Response) => {
  try {
    const [userCount, problemCount, topRating, submissionCount] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM users WHERE username != 'admin'"),
      pool.query('SELECT COUNT(*)::int AS count FROM problems'),
      pool.query("SELECT COALESCE(MAX(rating), 0)::int AS rating FROM users WHERE username != 'admin'"),
      pool.query('SELECT COUNT(*)::int AS count FROM submissions'),
    ]);

    res.json({
      totalUsers: userCount.rows[0].count,
      totalProblems: problemCount.rows[0].count,
      topRating: topRating.rows[0].rating,
      totalSubmissions: submissionCount.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// --- Problems Endpoint (Pagination & is_custom filter) ---
app.get('/api/problems', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let userId: number | null = null;

  if (token) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch (err) { }
  }

  const { page = '1', limit = '10', type = 'normal' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
  const offset = (pageNum - 1) * limitNum;
  const isCustomFilter = type === 'custom';

  try {
    // 검수 승인된 문제만 공개하고, 본인이 출제한 문제는 풀 목록에서 제외한다.
    let countQuery = `
      SELECT COUNT(DISTINCT p.id)
      FROM problems p
      WHERE p.is_custom = $1 AND p.review_status = 'approved'
    `;
    let countParams: any[] = [isCustomFilter];
    
    if (userId) {
      countQuery = `
        SELECT COUNT(DISTINCT p.id)
        FROM problems p
        WHERE p.is_custom = $1 AND p.review_status = 'approved'
          AND p.created_by IS DISTINCT FROM $2
          AND p.id NOT IN (
          SELECT problem_id FROM submissions WHERE user_id = $2 AND is_correct = true AND problem_id IS NOT NULL
        )
      `;
      countParams.push(userId);
    }
    
    const countRes = await pool.query(countQuery, countParams);
    const total = parseInt(countRes.rows[0].count);

    let query = `
      SELECT p.id, p.title, p.content, p.current_difficulty, p.is_custom, p.custom_reward_rating,
             p.created_by,
             (SELECT pi.token FROM uploaded_images pi WHERE pi.problem_id = p.id ORDER BY pi.id LIMIT 1) AS image_token,
             COALESCE(array_remove(array_agg(t.name), NULL), '{}') as tags
      FROM problems p
      LEFT JOIN problem_tags pt ON p.id = pt.problem_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.is_custom = $1 AND p.review_status = 'approved'
    `;
    
    let queryParams: any[] = [isCustomFilter];
    let nextIdx = 2;
    
    if (userId) {
      const userIdx = nextIdx++;
      query += ` AND p.created_by IS DISTINCT FROM $${userIdx}`;
      query += ` AND p.id NOT IN (
        SELECT problem_id FROM submissions WHERE user_id = $${userIdx} AND is_correct = true AND problem_id IS NOT NULL
      )`;
      queryParams.push(userId);
    }
    
    query += `
      GROUP BY p.id
      ORDER BY p.id DESC
      LIMIT $${nextIdx++} OFFSET $${nextIdx++}
    `;
    queryParams.push(limitNum, offset);

    const result = await pool.query(query, queryParams);
    
    res.json({
      problems: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Error fetching problems:', err);
    res.status(500).json({ error: 'Failed to fetch problems' });
  }
});

// --- 문제 출제 (일반 유저는 검수 대기, 관리자는 즉시 공개) ---
const USER_PROBLEM_MAX_PENDING = 5;
const USER_PROBLEM_REWARD_BY_LEVEL: Record<string, number> = { easy: 15000, normal: 25000, hard: 40000 };
const USER_PROBLEM_LIMITS = { title: 120, content: 1000, answer: 120, explanation: 1500, tag: 30 };

// HTML 태그만 지운다. 수학 부등호($1 < x < 3$)를 망가뜨리지 않도록
// 태그는 영문자·슬래시로 시작하는 형태(<script>, </div>)만 제거한다.
const stripHtmlTags = (value: unknown, maxLen: number): string =>
  typeof value === 'string' ? value.replace(/<[a-zA-Z/][^>]*>/g, '').trim().slice(0, maxLen) : '';

// 업로드 이미지: 최대 3MB. 클라이언트가 미리 줄여서 올리는 것을 전제로 한다.
const UPLOADED_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const UPLOADED_IMAGE_HOURLY_LIMIT = 20;

// 파일을 DB에 넣고 토큰을 돌려준다(문제 그림·프로필 사진 공용).
const storeUploadedImage = async (
  userId: number,
  file: Express.Multer.File,
  scope: 'problem' | 'profile'
): Promise<{ id: number; token: string }> => {
  const recent = await pool.query(
    "SELECT COUNT(*) FROM uploaded_images WHERE created_by = $1 AND created_at > NOW() - INTERVAL '1 hour'",
    [userId]
  );
  if (parseInt(recent.rows[0].count, 10) >= UPLOADED_IMAGE_HOURLY_LIMIT) {
    throw Object.assign(new Error('이미지를 너무 많이 올렸습니다. 잠시 후 다시 시도해주세요.'), { status: 429 });
  }

  const token = randomBytes(16).toString('hex');
  const inserted = await pool.query(
    `INSERT INTO uploaded_images (token, created_by, scope, mime, data, byte_size)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [token, userId, scope, file.mimetype || 'image/webp', file.buffer, file.size]
  );
  return { id: inserted.rows[0].id, token };
};

const uploadImageHandler = (req: any, res: Response) => {
  upload.single('image')(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || '이미지를 올리지 못했습니다.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
    }
    if (req.file.size > UPLOADED_IMAGE_MAX_BYTES) {
      return res.status(413).json({ error: '이미지는 3MB 이하만 올릴 수 있습니다.' });
    }

    try {
      const scope = req.body?.scope === 'profile' ? 'profile' : 'problem';
      const stored = await storeUploadedImage(req.user.id, req.file, scope);
      res.status(201).json({
        imageId: stored.id,
        token: stored.token,
        url: `/api/images/${stored.token}`,
        byteSize: req.file.size,
      });
    } catch (err: any) {
      console.error('이미지 업로드 실패:', err);
      res.status(err?.status || 500).json({ error: err?.message || '이미지를 저장하지 못했습니다.' });
    }
  });
};

app.post('/api/images', authenticateToken, uploadImageHandler);
// 이전 배포본 경로(캐시된 옛 번들이 쓰던 주소) — 같은 처리기에 연결해 둔다.
app.post('/api/problems/image', authenticateToken, uploadImageHandler);

// 이미지 서빙: 토큰을 아는 사람만 접근할 수 있다(순번이 아니라 32자 난수).
const serveImageHandler = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT mime, data FROM uploaded_images WHERE token = $1', [req.params.token]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
    }
    res.setHeader('Content-Type', result.rows[0].mime || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(result.rows[0].data));
  } catch (err) {
    console.error('이미지 조회 실패:', err);
    res.status(500).json({ error: '이미지를 불러오지 못했습니다.' });
  }
};

app.get('/api/images/:token', serveImageHandler);
app.get('/api/problems/images/:token', serveImageHandler);

app.post('/api/problems/submit', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const isAdmin = req.user.username === 'admin';
  const title = stripHtmlTags(req.body?.title, USER_PROBLEM_LIMITS.title);
  const content = stripHtmlTags(req.body?.content, USER_PROBLEM_LIMITS.content);
  const answer = stripHtmlTags(req.body?.answer, USER_PROBLEM_LIMITS.answer);
  const explanation = stripHtmlTags(req.body?.explanation, USER_PROBLEM_LIMITS.explanation);
  const level = ['easy', 'normal', 'hard'].includes(req.body?.level) ? String(req.body.level) : 'normal';
  // 출제 폼에서 먼저 올린 이미지(선택). 형식이 맞지 않으면 그냥 무시한다.
  const rawImageToken = req.body?.imageToken;
  const imageToken = typeof rawImageToken === 'string' && /^[a-f0-9]{32}$/.test(rawImageToken) ? rawImageToken : null;
  const rawTags: unknown = req.body?.tags;
  const tags = (Array.isArray(rawTags) ? rawTags : [])
    .map((t) => stripHtmlTags(t, USER_PROBLEM_LIMITS.tag))
    .filter(Boolean)
    .slice(0, 5);

  if (!title || !content || !answer) {
    return res.status(400).json({ error: '제목, 문제 내용, 정답은 모두 필요합니다.' });
  }
  if (title.length < 2) {
    return res.status(400).json({ error: '제목은 2자 이상이어야 합니다.' });
  }

  try {
    // 검수 대기 적체 방지: 승인·반려 전에는 새로 출제할 수 없다 (관리자는 예외).
    if (!isAdmin) {
      const pendingRes = await pool.query(
        "SELECT COUNT(*) FROM problems WHERE created_by = $1 AND review_status = 'pending'",
        [userId]
      );
      if (parseInt(pendingRes.rows[0].count, 10) >= USER_PROBLEM_MAX_PENDING) {
        return res.status(429).json({
          error: `검수 대기 중인 문제가 ${USER_PROBLEM_MAX_PENDING}개입니다. 승인·반려 후에 다시 출제해주세요.`,
        });
      }
    }

    const dupRes = await pool.query('SELECT id FROM problems WHERE is_custom = TRUE AND content = $1 LIMIT 1', [content]);
    if (dupRes.rows.length > 0) {
      return res.status(409).json({ error: '같은 내용의 문제가 이미 등록되어 있습니다.' });
    }

    // 보상 레이팅: 일반 유저는 난이도 등급(easy/normal/hard)으로만 결정되고,
    // 관리자는 5,000~150,000 범위에서 직접 지정할 수 있다.
    const reward = isAdmin
      ? Math.max(5000, Math.min(150000, Math.round((parseFloat(req.body?.ratingReward) || USER_PROBLEM_REWARD_BY_LEVEL[level]) / 500) * 500))
      : USER_PROBLEM_REWARD_BY_LEVEL[level];
    const reviewStatus = isAdmin ? 'approved' : 'pending';

    const result = await pool.query(
      `INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, is_custom, custom_reward_rating, reward_rating, created_by, review_status, explanation)
       VALUES ($1, $2, $3, $4, $4, 'Calculation', TRUE, $4, $4, $5, $6, $7) RETURNING id`,
      [title, content, answer, reward, userId, reviewStatus, explanation]
    );
    const problemId = result.rows[0].id;

    // 본인이 올린, 아직 어느 문제에도 붙지 않은 이미지만 연결한다.
    if (imageToken) {
      await pool.query(
        'UPDATE uploaded_images SET problem_id = $1 WHERE token = $2 AND created_by = $3 AND problem_id IS NULL',
        [problemId, imageToken, userId]
      );
    }

    for (const tagName of tags) {
      const tagRes = await pool.query('SELECT id FROM tags WHERE name = $1', [tagName]);
      const tagId = tagRes.rows.length > 0
        ? tagRes.rows[0].id
        : (await pool.query('INSERT INTO tags (name) VALUES ($1) RETURNING id', [tagName])).rows[0].id;
      await pool.query('INSERT INTO problem_tags (problem_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [problemId, tagId]);
    }

    if (!isAdmin) {
      await pool.query(
        'INSERT INTO admin_notifications (type, message, from_user_id, from_username, related_id) VALUES ($1, $2, $3, $4, $5)',
        ['problem_submission', `${req.user.username}님이 문제를 출제했습니다: "${title}" (검수 대기)`, userId, req.user.username, problemId]
      );
    }

    res.status(201).json({
      message: isAdmin ? '문제가 등록되었습니다.' : '출제한 문제가 검수 대기로 등록되었습니다.',
      problemId,
      reviewStatus,
    });
  } catch (err) {
    console.error('Failed to submit problem:', err);
    res.status(500).json({ error: '문제 출제에 실패했습니다.' });
  }
});

// 내가 출제한 문제 목록 (정답·해설·검수 상태·반려 사유 포함 — 본인 문제이므로 정답 노출 허용)
app.get('/api/problems/mine', authenticateToken, async (req: any, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, title, content, answer, explanation, current_difficulty, review_status, review_note, created_at,
              (SELECT pi.token FROM uploaded_images pi WHERE pi.problem_id = problems.id ORDER BY pi.id LIMIT 1) AS image_token
       FROM problems WHERE created_by = $1 ORDER BY id DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ problems: result.rows });
  } catch (err) {
    console.error('Failed to fetch my problems:', err);
    res.status(500).json({ error: '내 출제 문제를 불러오지 못했습니다.' });
  }
});

// 관리자: 출제 문제 심사 목록
app.get('/api/admin/problem-submissions', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const statusParam = typeof req.query.status === 'string' ? req.query.status : 'pending';
  const status = ['pending', 'approved', 'rejected'].includes(statusParam) ? statusParam : 'pending';
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.content, p.answer, p.explanation, p.current_difficulty,
              p.review_status, p.review_note, p.created_at, u.username,
              (SELECT pi.token FROM uploaded_images pi WHERE pi.problem_id = p.id ORDER BY pi.id LIMIT 1) AS image_token
       FROM problems p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.created_by IS NOT NULL AND p.review_status = $1
       ORDER BY p.id ASC LIMIT 200`,
      [status]
    );
    const countRes = await pool.query(
      "SELECT review_status, COUNT(*)::int AS count FROM problems WHERE created_by IS NOT NULL GROUP BY review_status"
    );
    const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const row of countRes.rows) counts[row.review_status] = row.count;
    res.json({ problems: result.rows, status, counts });
  } catch (err) {
    console.error('Failed to fetch problem submissions:', err);
    res.status(500).json({ error: '출제 심사 목록을 불러오지 못했습니다.' });
  }
});

// 관리자: 승인 / 반려
app.post('/api/admin/problem-submissions/:id/review', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const problemId = parseInt(req.params.id, 10);
  const action = req.body?.action;
  if (!Number.isInteger(problemId) || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action은 approve 또는 reject여야 합니다.' });
  }
  const reviewStatus = action === 'approve' ? 'approved' : 'rejected';
  const note = stripHtmlTags(req.body?.note ?? '', 300);
  try {
    const result = await pool.query(
      'UPDATE problems SET review_status = $1, review_note = $2 WHERE id = $3 AND created_by IS NOT NULL RETURNING id, title, created_by',
      [reviewStatus, note, problemId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '출제 문제를 찾을 수 없습니다.' });
    const row = result.rows[0];

    if (row.created_by != null) {
      const userRes = await pool.query('SELECT username FROM users WHERE id = $1', [row.created_by]);
      if (userRes.rows.length > 0) {
        const label = reviewStatus === 'approved' ? '승인' : '반려';
        await pool.query(
          'INSERT INTO admin_notifications (type, message, from_user_id, from_username, related_id) VALUES ($1, $2, $3, $4, $5)',
          [
            `problem_${reviewStatus}`,
            `"${row.title}" 문제 출제가 ${label}되었습니다.${note ? ` 사유: ${note}` : ''}`,
            req.user.id,
            userRes.rows[0].username,
            problemId,
          ]
        );
      }
    }

    res.json({ message: reviewStatus === 'approved' ? '문제를 승인했습니다.' : '문제를 반려했습니다.', reviewStatus });
  } catch (err) {
    console.error('Failed to review problem submission:', err);
    res.status(500).json({ error: '심사 처리에 실패했습니다.' });
  }
});


// Streak History API for Calendar representation
app.get('/api/users/:id/streak-history', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT DATE(submitted_at) as date, COUNT(*) as count 
       FROM submissions 
       WHERE user_id = $1 AND is_correct = true 
       GROUP BY DATE(submitted_at) 
       ORDER BY DATE(submitted_at) ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch streak history:', err);
    res.status(500).json({ error: '스트릭 세부 내역 조회에 실패했습니다.' });
  }
});

app.get('/api/problems/tags', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT name FROM tags ORDER BY name');
    res.json(result.rows.map(r => r.name));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

app.get('/api/problems/public', async (req: Request, res: Response) => {
  const { difficulty, concept, page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // Difficulty filter (tier name -> rating range)
  const difficultyRanges: Record<string, [number, number]> = {
    'bronze': [0, 100000],
    'silver': [100000, 300000],
    'gold': [300000, 800000],
    'platinum': [800000, 2000000],
    'diamond': [2000000, 5000000],
    'ruby': [5000000, 12000000],
    'master': [12000000, 30000000],
    'god': [30000000, 70000000],
    'hacker': [70000000, Infinity],
  };

  if (difficulty && typeof difficulty === 'string') {
    const key = difficulty.toLowerCase();
    const range = difficultyRanges[key];
    if (range) {
      conditions.push(`p.current_difficulty >= $${paramIndex}`);
      params.push(range[0]);
      paramIndex++;
      if (range[1] !== Infinity) {
        conditions.push(`p.current_difficulty < $${paramIndex}`);
        params.push(range[1]);
        paramIndex++;
      }
    }
  }

  // Concept filter (tag name)
  if (concept && typeof concept === 'string') {
    conditions.push(`t.name = $${paramIndex}`);
    params.push(concept);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT p.id)
      FROM problems p
      LEFT JOIN problem_tags pt ON p.id = pt.problem_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated problems
    const query = `
      SELECT p.id, p.title, p.content, p.current_difficulty, p.created_at,
             COALESCE(array_remove(array_agg(t.name ORDER BY t.name), NULL), '{}') as tags
      FROM problems p
      LEFT JOIN problem_tags pt ON p.id = pt.problem_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      ${whereClause}
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const result = await pool.query(query, [...params, limitNum, offset]);

    res.json({
      problems: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('Error fetching public problems:', err);
    res.status(500).json({ error: 'Failed to fetch problems' });
  }
});

app.post('/api/problems/generate', authenticateToken, async (req: any, res: Response) => {
  if (!(await canGenerateProblems(req.user.id))) return res.status(403).json({ error: '문제 생성 권한이 없습니다.' });
  try {
    const { tags, count = 5 } = req.body;
    const generationCount = Math.min(50, Math.max(1, parseInt(count) || 5));
    const newProblems = [];
    for (let i = 0; i < generationCount; i++) {
      const p = generateProblem(tags);
      const result = await pool.query(
        'INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [p.title, p.content, p.answer, p.difficulty, p.difficulty, 'Calculation']
      );
      const problemId = result.rows[0].id;
      
      // Add tags
      for (const tagName of p.tags) {
        const tagRes = await pool.query('SELECT id FROM tags WHERE name = $1', [tagName]);
        if (tagRes.rows.length > 0) {
          await pool.query('INSERT INTO problem_tags (problem_id, tag_id) VALUES ($1, $2)', [problemId, tagRes.rows[0].id]);
        }
      }
      const { answer, ...problemWithoutAnswer } = p;
      newProblems.push({ id: problemId, ...problemWithoutAnswer });
    }
    res.json({ message: `${generationCount}개의 문제가 생성되었습니다!`, problems: newProblems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate problems' });
  }
});
app.get('/api/problems/templates', async (_req: Request, res: Response) => {
  try {
    const templates = getAllTemplates().map((t) => ({
      id: t.id,
      unit: t.unit,
      title: t.title,
      difficulty: t.difficulty,
      reward_rating: t.reward_rating ?? t.difficulty,
      concepts: t.concepts,
    }));
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

app.get('/api/problems/templates/units', async (_req: Request, res: Response) => {
  try {
    res.json(getUnits());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load units' });
  }
});

app.get('/api/problems/templates/concepts', async (_req: Request, res: Response) => {
  try {
    res.json(getConcepts());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load concepts' });
  }
});

app.get('/api/problems/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = getTemplateById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load template' });
  }
});

// 문제에 태그를 붙인다(도메인 + 단원 + 개념). 태그가 없으면 만들고, 이미 붙었으면 넘어간다.
const attachProblemTags = async (problemId: number, tags?: string[] | null): Promise<number> => {
  if (!Array.isArray(tags) || tags.length === 0) return 0;
  let linked = 0;
  for (const name of tags.filter(Boolean)) {
    const tagRes = await pool.query(
      'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [name]
    );
    const inserted = await pool.query(
      'INSERT INTO problem_tags (problem_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [problemId, tagRes.rows[0].id]
    );
    linked += inserted.rowCount ?? 0;
  }
  return linked;
};

app.post('/api/problems/templates/generate', authenticateToken, async (req: any, res: Response) => {
  if (!(await canGenerateProblems(req.user.id))) return res.status(403).json({ error: '문제 생성 권한이 없습니다.' });
  try {
    const { templateId, templateIds, unit, concept, count = 1 } = req.body;
    const generationCount = Math.min(50, Math.max(1, parseInt(count) || 1));

    let problems: any[] = [];
    if (Array.isArray(templateIds) && templateIds.length > 0) {
      const perTemplate = Math.max(1, Math.floor(generationCount / templateIds.length));
      for (const tid of templateIds) {
        const template = getTemplateById(tid as string);
        if (template) problems.push(...batchGenerate(template, perTemplate));
      }
      if (problems.length === 0) return res.status(404).json({ error: '선택한 템플릿을 찾을 수 없습니다.' });
    } else if (templateId) {
      const template = getTemplateById(templateId as string);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      problems = batchGenerate(template, generationCount);
    } else if (unit || concept) {
      problems = generateTemplateProblems({ unit, concept, count: generationCount });
    } else {
      problems = generateTemplateProblems({ count: generationCount });
    }

    const newProblems = [];
    for (const p of problems) {
      const result = await pool.query(
        `INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, reward_rating, template_id, unit, domain)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [p.title, p.problem, String(p.answer), p.difficulty, p.rewardRating, 'Calculation', p.rewardRating,
         p.typeId || null, p.unit || null, p.domain || null],
      );
      const problemId = result.rows[0].id;
      await attachProblemTags(problemId, p.tags);
      newProblems.push({ id: problemId, title: p.title, content: p.problem, difficulty: p.difficulty, rewardRating: p.rewardRating, answer: p.answer, tags: p.tags || [], current_difficulty: 10000, domain: p.domain || null, unit: p.unit || null });
    }

    res.json({ message: `${problems.length}개의 문제가 생성되었습니다!`, problems: newProblems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate problems from templates' });
  }
});

app.post('/api/problems/templates/reload', authenticateToken, async (req: any, res: Response) => {
  if (!(await canGenerateProblems(req.user.id))) return res.status(403).json({ error: '문제 생성 권한이 없습니다.' });
  try {
    reloadTemplates();
    res.json({ message: '템플릿이 다시 로드되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reload templates' });
  }
});

// --- Bug Report API ---
app.post('/api/bug-reports', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const { title, category, description, steps } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: '제목과 설명을 입력해주세요.' });
  }
  try {
    const userRes = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const username = userRes.rows[0].username;
    const result = await pool.query(
      `INSERT INTO bug_reports (user_id, username, title, category, description, steps) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, username, title, category || '기타', description, steps || null]
    );
    await pool.query(
      `INSERT INTO admin_notifications (type, message, from_user_id, from_username, related_id) VALUES ($1, $2, $3, $4, $5)`,
      ['bug_report', `${username}님이 버그를 제보했습니다: "${title}"`, userId, username, result.rows[0].id]
    );
    res.status(201).json({ message: '버그 제보가 접수되었습니다. 감사합니다!', id: result.rows[0].id });
  } catch (err) {
    console.error('Bug report error:', err);
    res.status(500).json({ error: '버그 제보 접수에 실패했습니다.' });
  }
});

app.get('/api/admin/bug-reports', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const result = await pool.query('SELECT * FROM bug_reports ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '버그 제보 조회에 실패했습니다.' });
  }
});

// --- Admin Template CRUD ---
app.put('/api/admin/templates/:id', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  try {
    const template = updateTemplateData(id, req.body);
    res.json({ message: '템플릿이 수정되었습니다.', template });
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Template not found' });
  }
});

app.post('/api/admin/templates', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const template = addTemplate(req.body);
    res.status(201).json({ message: '템플릿이 추가되었습니다.', template });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to add template' });
  }
});

app.delete('/api/admin/templates/:id', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  try {
    deleteTemplate(id);
    res.json({ message: '템플릿이 삭제되었습니다.' });
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Template not found' });
  }
});

app.patch('/api/admin/templates/:id', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  const parsedRewardRating = Number(req.body.rewardRating);

  if (!Number.isFinite(parsedRewardRating) || parsedRewardRating < 0) {
    return res.status(400).json({ error: '올바른 레이팅 값을 입력해주세요.' });
  }

  try {
    const template = updateTemplateRewardRating(id, parsedRewardRating);
    res.json({
      message: '템플릿 해결 시 레이팅이 저장되었습니다.',
      template: {
        id: template.id,
        title: template.title,
        reward_rating: template.reward_rating ?? template.difficulty,
      },
    });
  } catch (err) {
    res.status(404).json({ error: 'Template not found' });
  }
});

app.post('/api/submissions', authenticateToken, async (req: any, res: any) => {
  const { problemId, userAnswer } = req.body;
  const userId = req.user.id;
  const handlerStart = Date.now();

  try {
    // DB에서 실제 정답 + rating용 데이터 가져오기 (중복 체크는 processSubmission 트랜잭션 내부에서 수행)
    const problemRes = await pool.query(
      'SELECT answer, content, is_custom, current_difficulty, total_attempts, correct_attempts, created_by, review_status FROM problems WHERE id = $1',
      [problemId]
    );
    if (problemRes.rows.length === 0) return res.status(404).json({ error: 'Problem not found' });
    // 검수 대기·반려 문제는 풀 수 없다 (목록에서도 숨겨지지만 API 직접 호출도 막는다)
    if (problemRes.rows[0].review_status && problemRes.rows[0].review_status !== 'approved') {
      return res.status(403).json({ error: '검수 중인 문제는 풀 수 없습니다.' });
    }
    // 본인이 출제한 문제는 풀 수 없다 — 자기 문제로 레이팅을 파밍하는 경로를 원천 차단한다
    if (problemRes.rows[0].created_by != null && Number(problemRes.rows[0].created_by) === Number(userId)) {
      return res.status(403).json({ error: '본인이 출제한 문제는 풀 수 없습니다.' });
    }

    const problemRow = problemRes.rows[0];
    const correctAnswer = problemRow.answer;
    const problemContent = problemRow.content || '';
    // 채점 규칙은 src/grading/answerCheck.ts 한 곳에 있다(익명 체험과 동일).
    const isCorrect = checkAnswer(userAnswer, correctAnswer, problemContent);

    const updateResult = await processSubmission(userId, problemId, isCorrect, {
      is_custom: problemRow.is_custom,
      current_difficulty: problemRow.current_difficulty,
      total_attempts: problemRow.total_attempts,
      correct_attempts: problemRow.correct_attempts,
    });
    if ((updateResult as any).alreadySolved) {
      return res.status(400).json({ error: 'Already solved this problem correctly!' });
    }

    // Combo is authoritative on the server: count backwards until the first wrong answer.
    let consecutiveCorrect = 0;
    let newlyUnlockedTitle: { title_id: string; name: string; description: string } | null = null;
    if (isCorrect) {
      const recentComboSubmissionsRes = await pool.query(
        'SELECT is_correct FROM submissions WHERE user_id = $1 ORDER BY submitted_at DESC, id DESC LIMIT 100',
        [userId]
      );
      for (const row of recentComboSubmissionsRes.rows) {
        if (!row.is_correct) break;
        consecutiveCorrect++;
      }

      if (consecutiveCorrect >= 20) {
        const unlockRes = await pool.query(
          `INSERT INTO user_titles (user_id, title_id)
           SELECT $1, title_id FROM titles WHERE title_id = 'one_shot_one_kill'
           ON CONFLICT (user_id, title_id) DO NOTHING
           RETURNING title_id`,
          [userId]
        );
        if (unlockRes.rowCount && unlockRes.rowCount > 0) {
          const titleRes = await pool.query(
            "SELECT title_id, name, description FROM titles WHERE title_id = 'one_shot_one_kill'"
          );
          newlyUnlockedTitle = titleRes.rows[0] || null;
        }
      }
    }

    if (process.env.LOG_SUBMISSION_PERF === '1') {
      console.log(`[submission-perf] handler user=${userId} problem=${problemId} total:${Date.now() - handlerStart}ms`);
    }
    res.json({ 
      isCorrect,
      ...updateResult,
      consecutiveCorrect,
      newlyUnlockedTitle
    });
  } catch (err) {
    if (process.env.LOG_SUBMISSION_PERF === '1') {
      console.log(`[submission-perf] handler error user=${userId} problem=${problemId} total:${Date.now() - handlerStart}ms`);
    }
    res.status(500).json({ error: 'Failed to process submission' });
  }
});

app.get('/api/admin/tier-config', async (_req: Request, res: Response) => {
  try {
    const tiers = await getTierConfig();
    res.json({ tiers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tier config' });
  }
});

app.put('/api/admin/tier-config', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const { tiers } = req.body;
    if (!Array.isArray(tiers) || tiers.length < 2) {
      return res.status(400).json({ error: 'At least 2 tiers required' });
    }
    const updated = await updateTierConfig(tiers);
    res.json({ tiers: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tier config' });
  }
});

app.get('/api/page-content/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const result = await pool.query('SELECT content, updated_at FROM page_content WHERE page_key = $1', [key]);
    if (result.rows.length === 0) {
      return res.json({ content: '', page_key: key });
    }
    res.json({ page_key: key, content: result.rows[0].content, updated_at: result.rows[0].updated_at });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch page content' });
  }
});

app.put('/api/admin/page-content/:key', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const { key } = req.params;
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }
    await pool.query(
      `INSERT INTO page_content (page_key, content, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (page_key) DO UPDATE SET content = $2, updated_at = NOW()`,
      [key, content]
    );
    res.json({ page_key: key, content, success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update page content' });
  }
});

app.post('/api/admin/cleanup-tags', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { tags } = req.body;
  if (!Array.isArray(tags) || tags.length === 0) {
    return res.status(400).json({ error: 'Tag names array required' });
  }

  try {
    let deletedCount = 0;
    for (const tagName of tags) {
      const tagRes = await pool.query('SELECT id FROM tags WHERE name = $1', [tagName]);
      if (tagRes.rows.length === 0) continue;
      const tagId = tagRes.rows[0].id;

      const problemIds = await pool.query('SELECT problem_id FROM problem_tags WHERE tag_id = $1', [tagId]);
      for (const row of problemIds.rows) {
        await pool.query('DELETE FROM problems WHERE id = $1', [row.problem_id]);
        deletedCount++;
      }
    }
    res.json({ message: `${deletedCount}개의 문제가 삭제되었습니다.`, deletedCount });
  } catch (err) {
    console.error('Cleanup error:', err);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

app.get('/api/admin/problems', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 50));
  const offset = (pageNum - 1) * limitNum;

  try {
    const countRes = await pool.query('SELECT COUNT(*) FROM problems');
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(`
      SELECT p.id, p.title, p.content, p.answer, p.current_difficulty, p.created_at,
             COALESCE(array_remove(array_agg(t.name ORDER BY t.name), NULL), '{}') as tags
      FROM problems p
      LEFT JOIN problem_tags pt ON p.id = pt.problem_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limitNum, offset]);

    res.json({
      problems: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error('Failed to fetch admin problems:', err);
    res.status(500).json({ error: 'Failed to fetch problems' });
  }
});

app.patch('/api/admin/problems/:id', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  const { title, content, answer, current_difficulty, tags } = req.body;

  try {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (title !== undefined) { fields.push(`title = $${idx++}`); params.push(title); }
    if (content !== undefined) { fields.push(`content = $${idx++}`); params.push(content); }
    if (answer !== undefined) { fields.push(`answer = $${idx++}`); params.push(answer); }
    if (current_difficulty !== undefined) { fields.push(`current_difficulty = $${idx++}`); params.push(current_difficulty); }

    if (fields.length > 0) {
      params.push(id);
      await pool.query(`UPDATE problems SET ${fields.join(', ')} WHERE id = $${idx}`, params);
    }

    if (Array.isArray(tags)) {
      await pool.query('DELETE FROM problem_tags WHERE problem_id = $1', [id]);
      for (const tagName of tags) {
        const tagRes = await pool.query('SELECT id FROM tags WHERE name = $1', [tagName]);
        if (tagRes.rows.length > 0) {
          await pool.query('INSERT INTO problem_tags (problem_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tagRes.rows[0].id]);
        }
      }
    }

    res.json({ message: '문제가 수정되었습니다.' });
  } catch (err) {
    console.error('Failed to update problem:', err);
    res.status(500).json({ error: 'Failed to update problem' });
  }
});

app.delete('/api/admin/problems/:id', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM problems WHERE id = $1', [id]);
    res.json({ message: '문제가 삭제되었습니다.' });
  } catch (err) {
    console.error('Failed to delete problem:', err);
    res.status(500).json({ error: 'Failed to delete problem' });
  }
});

app.post('/api/admin/problems/delete-mass-produced', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const countRes = await pool.query("SELECT COUNT(*) FROM problems WHERE is_custom = FALSE");
    const total = parseInt(countRes.rows[0].count);

    if (total === 0) return res.json({ message: '삭제할 양산 문제가 없습니다.', deletedCount: 0 });

    await pool.query("DELETE FROM problems WHERE is_custom = FALSE");
    res.json({ message: `${total}개의 양산 문제가 삭제되었습니다.`, deletedCount: total });
  } catch (err) {
    console.error('Failed to delete mass-produced problems:', err);
    res.status(500).json({ error: '양산 문제 삭제에 실패했습니다.' });
  }
});

app.post('/api/admin/seed', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  
  try {
    const generated = [];
    for (let i = 0; i < 10; i++) {
        const p = generateProblem();
        const result = await pool.query(
            'INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [p.title, p.content, p.answer, p.difficulty, p.difficulty, 'Calculation']
        );
        generated.push(result.rows[0].id);
    }
    res.json({ message: '10 problems added successfully', ids: generated });
  } catch (err) {
    res.status(500).json({ error: 'Seeding failed' });
  }
});

app.post('/api/admin/problems/import-csv', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { problems } = req.body;
  if (!Array.isArray(problems) || problems.length === 0) {
    return res.status(400).json({ error: 'problems 배열이 필요합니다.' });
  }

  const optionKeys = ['A', 'B', 'C', 'D'];
  const inserted: number[] = [];
  let errors = 0;

  for (const row of problems) {
    try {
      const question = row.question || '';
      const answerNum = parseInt(row.answer);
      const options = optionKeys.map(k => row[k] || '');

      if (!question || isNaN(answerNum) || answerNum < 1 || answerNum > 4) {
        errors++;
        continue;
      }

      const correctAnswer = options[answerNum - 1];
      const formattedContent = `${question}\n\n선택지:\nA. ${options[0]}\nB. ${options[1]}\nC. ${options[2]}\nD. ${options[3]}`;
      const title = question.replace(/\$+/g, '').replace(/[{}]/g, '').substring(0, 60);

      const result = await pool.query(
        'INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, is_custom, custom_reward_rating, reward_rating) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8) RETURNING id',
        [title, formattedContent, correctAnswer, 10000, 'Calculation', true, 10000, 10000]
      );

      const tags = ['CSV'];
      if (row.Category) tags.push(row.Category);
      for (const tagName of tags) {
        let tagRes = await pool.query('SELECT id FROM tags WHERE name = $1', [tagName]);
        let tagId;
        if (tagRes.rows.length === 0) {
          const insertTagRes = await pool.query('INSERT INTO tags (name) VALUES ($1) RETURNING id', [tagName]);
          tagId = insertTagRes.rows[0].id;
        } else {
          tagId = tagRes.rows[0].id;
        }
        await pool.query('INSERT INTO problem_tags (problem_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [result.rows[0].id, tagId]);
      }

      inserted.push(result.rows[0].id);
    } catch {
      errors++;
    }
  }

  res.json({ message: `${inserted.length}개 문제를 커스텀 문제로 추가했습니다.${errors > 0 ? ` (${errors}개 실패)` : ''}`, ids: inserted });
});

app.post('/api/admin/reset', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  
  try {
    await pool.query('DELETE FROM problems');
    await pool.query("ALTER SEQUENCE problems_id_seq RESTART WITH 1");
    res.json({ message: '모든 문제가 삭제되었습니다. (제출 기록은 유지됩니다)' });
  } catch (err) {
    res.status(500).json({ error: 'Database reset failed' });
  }
});

// --- User Management Admin APIs ---

app.get('/api/admin/users', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.rating, u.tokens, u.created_at, u.can_generate_problems, u.custom_title,
             COUNT(s.id) as total_submissions,
             SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END) as correct_submissions
      FROM users u
      LEFT JOIN submissions s ON u.id = s.user_id
      GROUP BY u.id
      ORDER BY u.rating DESC
    `);
    const users = result.rows.map(u => ({
      ...u,
      tier: getTier(parseFloat(u.rating)),
      total_submissions: parseInt(u.total_submissions),
      correct_submissions: parseInt(u.correct_submissions || 0),
      can_generate_problems: u.can_generate_problems === true
    }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.patch('/api/admin/users/:id/rating', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  const { rating } = req.body;
  
  try {
    const result = await pool.query(
      'UPDATE users SET rating = $1 WHERE id = $2 RETURNING id, username, rating',
      [rating, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Rating updated successfully', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update rating' });
  }
});

app.patch('/api/admin/users/:id/problem-generation', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  const { canGenerateProblems: canGenerate } = req.body;

  try {
    const result = await pool.query(
      'UPDATE users SET can_generate_problems = $1 WHERE id = $2 RETURNING id, username, can_generate_problems',
      [!!canGenerate, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: '문제 생성 권한이 업데이트되었습니다.', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update problem generation permission' });
  }
});

app.patch('/api/admin/users/:id/tokens', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  const { tokens } = req.body;

  try {
    const result = await pool.query(
      'UPDATE users SET tokens = $1 WHERE id = $2 RETURNING id, username, tokens',
      [tokens, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: '토큰이 업데이트되었습니다.', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '토큰 업데이트에 실패했습니다.' });
  }
});

app.patch('/api/admin/users/:id/custom-title', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  const { customTitle } = req.body;

  try {
    const result = await pool.query(
      "UPDATE users SET custom_title = $1 WHERE id = $2 RETURNING id, username, custom_title",
      [customTitle || '', id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: '커스텀 칭호가 설정되었습니다.', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '커스텀 칭호 설정에 실패했습니다.' });
  }
});

app.patch('/api/admin/users/:id/username', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  const { username } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return res.status(400).json({ error: '올바른 사용자명을 입력해주세요.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username.trim(), id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '이미 사용 중인 사용자명입니다.' });
    }

    const result = await pool.query(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username',
      [username.trim(), id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: '사용자명이 변경되었습니다.', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '사용자명 변경에 실패했습니다.' });
  }
});

app.get('/api/admin/notifications', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const result = await pool.query(
      'SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT 100'
    );
    const unreadCount = await pool.query(
      "SELECT COUNT(*) FROM admin_notifications WHERE is_read = FALSE"
    );
    res.json({
      notifications: result.rows,
      unreadCount: parseInt(unreadCount.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: '알림 조회에 실패했습니다.' });
  }
});

app.post('/api/admin/notifications/:id/read', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;

  try {
    await pool.query('UPDATE admin_notifications SET is_read = TRUE WHERE id = $1', [id]);
    res.json({ message: '알림이 읽음 처리되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '알림 읽음 처리에 실패했습니다.' });
  }
});

// ============ 분야별 정복도 (프로필 다각형 그래프) ============
// 축은 아래 6개로 고정한다. 문제마다 기록된 domain을 기준으로 집계하므로 태그가 없어도 동작한다.
const RADAR_DOMAINS = ['수와 연산', '문자와 식', '방정식과 부등식', '함수', '도형', '확률과 통계'];

// 정복도 = 정답률 × 시도 횟수 신뢰도. 10문제 이상 풀면 정답률이 그대로 반영되고,
// 그보다 적게 풀었으면 그만큼 낮게 잡아 "1문제 맞히고 100%" 같은 착시를 막는다.
const masteryOf = (attempts: number, correct: number): number => {
  if (attempts <= 0) return 0;
  return Math.round((correct / attempts) * Math.min(1, attempts / 10) * 100);
};

app.get('/api/users/domain-radar', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let userId: number | null = null;
  if (token) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch (err) { /* 비로그인 취급 */ }
  }
  const queryUserId = parseInt(String(req.query.userId ?? ''), 10);
  const targetId = Number.isFinite(queryUserId) && queryUserId > 0 ? queryUserId : userId;
  if (!targetId) return res.status(401).json({ error: '로그인이 필요합니다.' });

  try {
    const rows = (await pool.query(
      `SELECT p.domain,
              COUNT(*)::int AS attempts,
              COUNT(*) FILTER (WHERE s.is_correct)::int AS correct,
              COUNT(DISTINCT s.problem_id)::int AS solved
       FROM submissions s
       JOIN problems p ON p.id = s.problem_id
       WHERE s.user_id = $1 AND p.domain IS NOT NULL
       GROUP BY p.domain`,
      [targetId]
    )).rows as any[];

    const byDomain = new Map<string, any>(rows.map((r) => [r.domain, r]));
    const domains = RADAR_DOMAINS.map((domain) => {
      const row = byDomain.get(domain);
      const attempts = row ? Number(row.attempts) : 0;
      const correct = row ? Number(row.correct) : 0;
      return {
        domain,
        attempts,
        correct,
        solved: row ? Number(row.solved) : 0,
        accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : 0,
        mastery: masteryOf(attempts, correct),
      };
    });

    const totalAttempts = domains.reduce((sum, d) => sum + d.attempts, 0);
    const totalCorrect = domains.reduce((sum, d) => sum + d.correct, 0);
    const played = domains.filter((d) => d.attempts > 0);
    const strongest = played.length > 1
      ? played.reduce((a, b) => (b.mastery > a.mastery ? b : a))
      : null;
    const weakest = played.length > 1
      ? played.reduce((a, b) => (b.mastery < a.mastery ? b : a))
      : null;

    res.json({
      userId: targetId,
      domains,
      totalAttempts,
      totalCorrect,
      accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
      strongest: strongest ? { domain: strongest.domain, mastery: strongest.mastery } : null,
      weakest: weakest ? { domain: weakest.domain, mastery: weakest.mastery } : null,
    });
  } catch (error: any) {
    console.error('분야별 통계 조회 실패:', error?.message || error);
    res.status(500).json({ error: '분야별 통계를 불러오지 못했습니다.' });
  }
});

// 문제가 성립하지 않아 없앤 템플릿(제목은 삭제 전 값 — 옛 문제를 제목으로도 잡기 위함).
const REMOVED_TEMPLATE_IDS = ['MS-STAT-001', 'MS-INEQ-002', 'MS-FACT-003', 'MS-SYSEQ-003', 'MS-COORD-001'];
const REMOVED_TEMPLATE_TITLES = ['평균 계산', '부등식의 성질', '공통인수 추출', '속력차를 이용한 연립방정식', '사분면 위의 점'];
// 오류를 고친 뒤 다시 만들어야 하는 템플릿.
const REBUILT_TEMPLATE_IDS = ['MS-QUAD-002', 'MS-QUADF-001', 'MS-NUM-002', 'MS-EQ-PR-001', 'MS-RATIO-001', 'MS-POLY-001', 'MS-SPD-001', 'MS-CONC-001'];
const REBUILD_PER_TEMPLATE = 30;

// 지정한 템플릿들의 기존 문제를 지우고(오답·깨진 문제가 남지 않도록) 다시 생성한다.
// 삭제된 템플릿은 생성할 수 없으므로 삭제만 된다.
const rebuildTemplateProblems = async (
  opts?: { templateIds?: string[]; perTemplate?: number; regenerate?: boolean },
): Promise<{ deletedProblems: number; generatedProblems: number; templates: string[] }> => {
  const ids = opts?.templateIds ?? REBUILT_TEMPLATE_IDS;
  const perTemplate = Math.max(0, Math.min(200, opts?.perTemplate ?? REBUILD_PER_TEMPLATE));
  const regenerate = opts?.regenerate ?? true;

  const titles = [
    ...REMOVED_TEMPLATE_TITLES,
    ...ids.map((id) => getTemplateById(id)?.title).filter((t): t is string => Boolean(t)),
  ];

  // 없앤 템플릿은 id·제목 둘 다로 잡는다(template_id가 아직 없던 옛 문제까지 포함).
  const deleted = await pool.query(
    `DELETE FROM problems
     WHERE is_custom IS NOT TRUE
       AND (template_id = ANY($1::text[]) OR title = ANY($2::text[]))`,
    [[...REMOVED_TEMPLATE_IDS, ...ids], titles]
  );

  let generatedProblems = 0;
  if (regenerate && perTemplate > 0) {
    for (const id of ids) {
      const template = getTemplateById(id);
      if (!template) continue; // 없앤 템플릿은 다시 만들지 않는다
      const generated = batchGenerate(template, perTemplate);
      if (generated.length === 0) continue;

      // 태그는 템플릿별로 한 번만 확보한다.
      const tagIds: number[] = [];
      for (const name of new Set(generated.flatMap((p) => p.tags ?? template.tags ?? []))) {
        const tagRes = await pool.query(
          'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
          [name]
        );
        tagIds.push(Number(tagRes.rows[0].id));
      }

      for (const p of generated) {
        const res = await pool.query(
          `INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, reward_rating, template_id, unit, domain)
           VALUES ($1, $2, $3, $4, $5, 'Calculation', $6, $7, $8, $9) RETURNING id`,
          [p.title, p.problem, String(p.answer), p.difficulty, p.rewardRating, p.rewardRating,
           p.typeId || template.id, p.unit ?? template.unit ?? null, p.domain ?? template.domain ?? null]
        );
        if (tagIds.length > 0) {
          await pool.query(
            'INSERT INTO problem_tags (problem_id, tag_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
            [res.rows[0].id, tagIds]
          );
        }
        generatedProblems++;
      }
    }
  }

  return { deletedProblems: deleted.rowCount ?? 0, generatedProblems, templates: ids };
};

// 템플릿 제목 → 기존 문제를 되짚어 단원·도메인·템플릿ID·태그를 채운다. 멱등.
const backfillProblemDomains = async (): Promise<{
  matchedProblems: number;
  tagsInserted: number;
  tags: number;
  templates: number;
}> => {
  const templates = getAllTemplates();

  const valueRows: string[] = [];
  const updateParams: any[] = [];
  templates.forEach((t, i) => {
    const base = i * 4;
    valueRows.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    updateParams.push(t.title, t.id, t.unit ?? '', t.domain ?? '');
  });

  const updated = await pool.query(
    `UPDATE problems p
     SET template_id = m.template_id, unit = m.unit, domain = m.domain
     FROM (VALUES ${valueRows.join(', ')}) AS m(title, template_id, unit, domain)
     WHERE p.title = m.title AND p.is_custom IS NOT TRUE
     RETURNING p.id`,
    updateParams
  );

  // 태그는 한 번에 만들고(중복 무시) 한 번에 조회한다.
  const allTags = [...new Set(templates.flatMap((t) => t.tags ?? []))];
  await pool.query('INSERT INTO tags (name) SELECT DISTINCT unnest($1::text[]) ON CONFLICT (name) DO NOTHING', [allTags]);
  const tagRows = (await pool.query('SELECT id, name FROM tags WHERE name = ANY($1::text[])', [allTags])).rows as any[];
  const tagIds = new Map<string, number>(tagRows.map((r) => [r.name, Number(r.id)]));

  // 문제 수와 무관하게 상수 크기 쿼리로 연결한다(template_id 조인).
  const pairRows: string[] = [];
  const pairParams: any[] = [];
  for (const t of templates) {
    for (const name of t.tags ?? []) {
      const tagId = tagIds.get(name);
      if (!tagId) continue;
      const base = pairParams.length;
      pairRows.push(`($${base + 1}::text, $${base + 2}::int)`);
      pairParams.push(t.id, tagId);
    }
  }

  let tagsInserted = 0;
  if (pairRows.length > 0) {
    const tagRes = await pool.query(
      `INSERT INTO problem_tags (problem_id, tag_id)
       SELECT p.id, m.tag_id
       FROM problems p
       JOIN (VALUES ${pairRows.join(', ')}) AS m(template_id, tag_id) ON m.template_id = p.template_id
       ON CONFLICT DO NOTHING`,
      pairParams
    );
    tagsInserted = tagRes.rowCount ?? 0;
  }

  return {
    matchedProblems: updated.rowCount ?? 0,
    tagsInserted,
    tags: tagIds.size,
    templates: templates.length,
  };
};

// 관리자: 깨진/수정된 템플릿의 문제를 지우고 다시 생성한다.
// body: { templateIds?: string[], perTemplate?: number, regenerate?: boolean }
app.post('/api/admin/problems/rebuild-templates', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const templateIds = Array.isArray(req.body?.templateIds) && req.body.templateIds.length > 0
      ? req.body.templateIds.map((v: any) => String(v))
      : undefined;
    res.json(await rebuildTemplateProblems({
      templateIds,
      perTemplate: req.body?.perTemplate,
      regenerate: req.body?.regenerate !== false,
    }));
  } catch (error: any) {
    console.error('템플릿 문제 재생성 실패:', error?.message || error);
    res.status(500).json({ error: error?.message || '재생성에 실패했습니다.' });
  }
});

// 관리자: 위 백필을 수동으로 다시 돌린다(결과 숫자를 확인할 때 사용).
app.post('/api/admin/problems/backfill-domains', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    res.json(await backfillProblemDomains());
  } catch (error: any) {
    console.error('도메인 백필 실패:', error?.message || error);
    res.status(500).json({ error: error?.message || '도메인 채우기에 실패했습니다.' });
  }
});

app.get('/api/users/problem-type-stats', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT t.name as tag_name, COUNT(*) as solved_count
      FROM submissions s
      JOIN problem_tags pt ON s.problem_id = pt.problem_id
      JOIN tags t ON pt.tag_id = t.id
      WHERE s.user_id = $1 AND s.is_correct = true
      GROUP BY t.name
      ORDER BY t.name
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch problem type stats:', err);
    res.status(500).json({ error: '통계 조회에 실패했습니다.' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, username', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `User ${result.rows[0].username} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// --- Admin: User Submission History ---
app.get('/api/admin/users/:userId/submissions', authenticateToken, async (req: any, res: Response) => {
  if (req.user.username !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { userId } = req.params;
  const { page = '1' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string) || 1);
  const limitNum = 100;
  const offset = (pageNum - 1) * limitNum;

  try {
    const countRes = await pool.query(
      'SELECT COUNT(*) FROM submissions WHERE user_id = $1', [userId]
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(`
      SELECT * FROM (
        SELECT
          s.id, s.submitted_at, s.is_correct, s.user_answer,
          p.id as problem_id, p.title as problem_title, p.difficulty,
          EXTRACT(EPOCH FROM (s.submitted_at - LAG(s.submitted_at) OVER (ORDER BY s.submitted_at ASC))) as time_diff_seconds
        FROM submissions s
        LEFT JOIN problems p ON s.problem_id = p.id
        WHERE s.user_id = $1
      ) sub
      ORDER BY sub.submitted_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limitNum, offset]);

    res.json({
      submissions: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    console.error('Failed to fetch user submissions:', err);
    res.status(500).json({ error: '제출 기록 조회에 실패했습니다.' });
  }
});

// --- Profile CSS Customization ---
app.post('/api/profile/css', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  const { css } = req.body;
  if (typeof css !== 'string') return res.status(400).json({ error: '올바른 CSS 값을 입력해주세요.' });
  try {
    await pool.query('UPDATE users SET profile_css = $1 WHERE id = $2', [css, userId]);
    res.json({ message: '프로필 CSS가 저장되었습니다.' });
  } catch (err) {
    console.error('Failed to save profile CSS:', err);
    res.status(500).json({ error: 'CSS 저장에 실패했습니다.' });
  }
});

// --- Profile Badges API ---
app.get('/api/profile/badges', authenticateToken, async (req: any, res: Response) => {
  const userId = req.user.id;
  try {
    const badgesRes = await pool.query('SELECT * FROM profile_badges ORDER BY id');
    const userBadgesRes = await pool.query('SELECT badge_id FROM user_profile_badges WHERE user_id = $1', [userId]);
    const userBadgeIds = new Set(userBadgesRes.rows.map((r: any) => r.badge_id));

    const correctRes = await pool.query(
      'SELECT COUNT(*) as cnt FROM submissions WHERE user_id = $1 AND is_correct = true',
      [userId]
    );
    const correctCount = parseInt(correctRes.rows[0].cnt) || 0;
    const userRes = await pool.query('SELECT streak, tokens, xp FROM users WHERE id = $1', [userId]);

    const badges = badgesRes.rows.map((b: any) => {
      let autoUnlock = false;
      if (b.condition_type === 'solve_count' && correctCount >= b.condition_value) autoUnlock = true;
      if (b.condition_type === 'streak' && (userRes.rows[0]?.streak || 0) >= b.condition_value) autoUnlock = true;

      if (autoUnlock && !userBadgeIds.has(b.badge_id)) {
        pool.query(
          'INSERT INTO user_profile_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, b.badge_id]
        ).catch(() => {});
        userBadgeIds.add(b.badge_id);
      }

      return {
        ...b,
        unlocked: userBadgeIds.has(b.badge_id) || autoUnlock,
      };
    });

    res.json({ badges });
  } catch (err) {
    console.error('Failed to fetch badges:', err);
    res.status(500).json({ error: '뱃지 목록 조회에 실패했습니다.' });
  }
});

// --- 404 Handler for API routes ---
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// --- Sitemap ---
app.get('/api/sitemap.xml', async (req: Request, res: Response) => {
  const SITE_URL = 'https://llogis.xyz';

  try {
    const usersResult = await pool.query(
      "SELECT id, updated_at FROM users WHERE username != 'admin' ORDER BY id"
    );

    const groupsResult = await pool.query('SELECT id, created_at FROM groups ORDER BY id');

    const now = new Date().toISOString();

    let urls = `
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>${SITE_URL}/ranking</loc>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>${SITE_URL}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>${SITE_URL}/groups</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>`;

    for (const user of usersResult.rows) {
      urls += `
  <url>
    <loc>${SITE_URL}/users/${user.id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
    <lastmod>${user.updated_at ? new Date(user.updated_at).toISOString() : now}</lastmod>
  </url>`;
    }

    for (const group of groupsResult.rows) {
      urls += `
  <url>
    <loc>${SITE_URL}/groups/${group.id}</loc>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
    <lastmod>${group.created_at ? new Date(group.created_at).toISOString() : now}</lastmod>
  </url>`;
    }

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;

    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.send(sitemap);
  } catch (err) {
    console.error('Failed to generate sitemap:', err);
    res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate sitemap</error>');
  }
});

if (fs.existsSync(frontendDist)) {
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

if (process.env.VERCEL !== '1') {
  ensureSchema()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize database schema:', err);
      process.exit(1);
    });
}

export { app, ensureSchema };
export default app;
