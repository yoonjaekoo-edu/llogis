-- Database Schema and 100 Seed Problems for Logis

-- Enum for Problem Types
CREATE TYPE problem_type AS ENUM ('Proof', 'Calculation', 'Implementation');

-- Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    profile_image_url TEXT,
    can_generate_problems BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Problems Table
CREATE TABLE problems (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    answer VARCHAR(255) NOT NULL,
    initial_difficulty FLOAT NOT NULL,
    current_difficulty FLOAT NOT NULL,
    type problem_type DEFAULT 'Calculation' NOT NULL,
    estimated_time INTEGER,
    total_attempts INTEGER DEFAULT 0,
    correct_attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tags Table
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- ProblemTags Junction Table
CREATE TABLE problem_tags (
    problem_id INTEGER REFERENCES problems(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (problem_id, tag_id)
);

-- Submissions Table
CREATE TABLE submissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    problem_id INTEGER REFERENCES problems(id) ON DELETE SET NULL,
    is_correct BOOLEAN NOT NULL,
    user_answer VARCHAR(255),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- Groups Table
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Group Members Table
CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
);

-- Group Join Requests Table
CREATE TABLE IF NOT EXISTS group_join_requests (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id)
);

-- 초기 사용자
INSERT INTO users (username, email, password_hash, can_generate_problems) 
VALUES 
('math_pro', 'pro@logis.com', '$2b$10$w/y055HsTmmkZHrvDINxSe5xxS8E59E1/vk6AOcjlzhFmuXZMKkAu', FALSE),
('admin', 'admin@logis.com', '$2b$10$ocxbuGqhp0/2NJ9uPZ.SsOFRXXFWAaPjrn0mmKO0UiLmQJ7LYvH3G', TRUE);

-- 태그 등록
INSERT INTO tags (name) VALUES ('일차방정식'), ('이차방정식'), ('연립방정식'), ('부등식'), ('일차함수'), ('식의계산'), ('도형');

-- 100문제 데이터 생성 (일차방정식, 연립방정식, 부등식, 함수 등)
INSERT INTO problems (title, content, answer, initial_difficulty, current_difficulty, type, estimated_time) VALUES
-- 1-20: 일차방정식 (기초~심화)
('방정식 기초 01', '$x + 12 = 25$ 의 해는?', '13', 60000, 60000, 'Calculation', 2),
('방정식 기초 02', '$2x - 5 = 11$ 의 해는?', '8', 62000, 62000, 'Calculation', 2),
('방정식 기초 03', '$3(x + 2) = 15$ 의 해는?', '3', 65000, 65000, 'Calculation', 3),
('방정식 기초 04', '$4x - 7 = x + 8$ 의 해는?', '5', 68000, 68000, 'Calculation', 3),
('방정식 기초 05', '$-2x + 10 = 4$ 의 해는?', '3', 63000, 63000, 'Calculation', 2),
('방정식 소수 06', '$0.3x + 0.5 = 1.4$ 의 해는?', '3', 72000, 72000, 'Calculation', 4),
('방정식 활용 09', '어떤 수 $x$에서 4를 뺀 후 3배를 하면 12가 된다. $x$는?', '8', 85000, 85000, 'Calculation', 5),
('방정식 활용 10', '연속하는 세 정수의 합이 36일 때, 가장 작은 수는?', '11', 88000, 88000, 'Calculation', 5),
('방정식 소수 11', '$0.2(x-1) = 0.8$ 의 해는?', '5', 74000, 74000, 'Calculation', 4),
('방정식 복잡 13', '$5(x-2) - 3(x+1) = 1$ 의 해는?', '7', 90000, 90000, 'Calculation', 6),
('방정식 활용 15', '어머니 나이는 40세, 아들은 10세이다. 어머니 나이가 아들의 3배가 되는 것은 몇 년 후?', '5', 100000, 100000, 'Calculation', 8),
('방정식 활용 16', '직사각형 둘레가 40cm이고 가로가 세로보다 4cm 더 길 때, 가로 길이는 (cm)?', '12', 98000, 98000, 'Calculation', 6),
('방정식 활용 17', '시속 4km로 $x$시간 동안 걸은 거리가 12km일 때, $x$는?', '3', 85000, 85000, 'Calculation', 3),
('방정식 소수 18', '$1.2x - 0.4 = 2$ 의 해는?', '2', 78000, 78000, 'Calculation', 4),
('방정식 기초 20', '$7 - x = 2x - 5$ 의 해는?', '4', 68000, 68000, 'Calculation', 3),

-- 21-40: 식의 계산 & 지수법칙 (중2)
('지수법칙 21', '$2^3 \\times 2^x = 2^7$ 일 때, $x$는?', '4', 80000, 80000, 'Calculation', 3),
('지수법칙 22', '$(3^2)^3 = 3^x$ 일 때, $x$는?', '6', 82000, 82000, 'Calculation', 3),
('지수법칙 23', '$5^x \\div 5^2 = 5^3$ 일 때, $x$는?', '5', 85000, 85000, 'Calculation', 3),
('식의 계산 24', '$3x + 5x - 2x$ 를 계산하면?', '6x', 70000, 70000, 'Calculation', 2),
('식의 계산 25', '$2(a+3b) - (a-b)$ 를 간단히 하면 $ma+nb$이다. $m+n$은?', '8', 92000, 92000, 'Calculation', 5),
('단항식 계산 26', '$12x^2y \\div 4xy$ 를 계산하면?', '3x', 88000, 88000, 'Calculation', 4),
('단항식 계산 27', '$2a^2 \\times 3a^3$ 을 계산하면?', '6a^5', 85000, 85000, 'Calculation', 3),
('식의 계산 28', '$x(x+2) - x^2$ 를 계산하면?', '2x', 82000, 82000, 'Calculation', 3),
('지수법칙 29', '$a^2 \\times a^x = a^8$ 에서 $x$는?', '6', 78000, 78000, 'Calculation', 2),
('단항식 계산 30', '$(2x)^3$ 을 계산하면?', '8x^3', 80000, 80000, 'Calculation', 3),
('식의 값 31', '$x=2, y=-1$ 일 때, $3x+2y$의 값은?', '4', 75000, 75000, 'Calculation', 3),
('전개식 33', '$3(2x-1)$ 을 전개하면?', '6x-3', 70000, 70000, 'Calculation', 2),
('지수법칙 34', '$2^{10} \\div 2^x = 16$ 일 때, $x$는?', '6', 90000, 90000, 'Calculation', 5),
('단항식 곱셈 35', '$(-3a)^2$ 을 계산하면?', '9a^2', 82000, 82000, 'Calculation', 3),
('식의 변형 36', '$2x - y = 5$ 를 $y$에 관하여 풀면 $y = ax + b$이다. $a+b$는?', '-3', 105000, 105000, 'Calculation', 7),
('다항식 계산 37', '$(x+y) + (2x-y)$ 를 계산하면?', '3x', 72000, 72000, 'Calculation', 2),
('식의 계산 38', '$5ab^2 \\div (-ab)$ 를 계산하면?', '-5b', 88000, 88000, 'Calculation', 4),
('지수법칙 39', '$3^4 + 3^4 + 3^4 = 3^x$ 일 때, $x$는?', '5', 110000, 110000, 'Calculation', 6),
('식의 계산 40', '$2(x-1) + 3(x+2)$ 를 계산하면 $ax+b$이다. $a+b$는?', '9', 85000, 85000, 'Calculation', 4),

-- 41-60: 부등식 (중2)
('부등식 기초 41', '$2x < 10$ 의 해 중 가장 큰 정수는?', '4', 78000, 78000, 'Calculation', 3),
('부등식 기초 42', '$x + 5 \ge 8$ 의 해는?', 'x>=3', 80000, 80000, 'Calculation', 3),
('부등식 성질 43', '$-3x > 9$ 의 해는?', 'x<-3', 85000, 85000, 'Calculation', 4),
('일차부등식 44', '$3x - 2 \le 7$ 의 해는?', 'x<=3', 88000, 88000, 'Calculation', 4),
('부등식 활용 45', '한 자루에 800원인 볼펜을 $x$자루 사고 5000원을 냈을 때 거스름돈이 남으려면 $x$는 최대 얼마?', '6', 95000, 95000, 'Calculation', 6),
('일차부등식 46', '$2(x-3) > 4$ 의 해는?', 'x>5', 92000, 92000, 'Calculation', 5),
('부등식 소수 47', '$0.4x - 1.2 < 0.8$ 의 해는?', 'x<5', 98000, 98000, 'Calculation', 6),
('부등식 복잡 49', '$5x - 3 \ge 2x + 6$ 의 해는?', 'x>=3', 95000, 95000, 'Calculation', 5),
('부등식 정수해 50', '$3x - 1 < 10$ 을 만족하는 자연수 $x$의 개수는?', '3', 90000, 90000, 'Calculation', 4),
('부등식 기초 51', '$-x + 4 \le 1$ 의 해는?', 'x>=3', 82000, 82000, 'Calculation', 3),
('부등식 활용 52', '어떤 수 $x$의 2배에서 5를 뺀 값은 15보다 작다. $x$의 범위는?', 'x<10', 88000, 88000, 'Calculation', 5),
('부등식 성질 54', '$a < b$ 일 때, $-2a+3$ 과 $-2b+3$ 중 큰 것은? (A/B 선택)', 'A', 110000, 110000, 'Calculation', 6),
('부등식 활용 55', '한 판에 15000원인 피자를 $x$판 시키고 배달비 2000원을 포함해 50000원 이하로 지불하려면 $x$는 최대 얼마?', '3', 105000, 105000, 'Calculation', 7),
('일차부등식 56', '$4x - (x+3) \le 6$ 의 해는?', 'x<=3', 92000, 92000, 'Calculation', 5),
('부등식 소수 57', '$0.2x + 0.3 \ge 0.5x - 0.6$ 의 해는?', 'x<=3', 102000, 102000, 'Calculation', 6),
('부등식 활용 58', '평균 점수가 80점 이상이 되어야 한다. 세 번의 시험 점수가 75, 82, $x$일 때 $x$의 최솟값은?', '83', 115000, 115000, 'Calculation', 10),
('부등식 기초 59', '$7x + 2 > 3x + 14$ 의 해는?', 'x>3', 86000, 86000, 'Calculation', 4),

-- 61-80: 연립방정식 (중2)
('연립방정식 61', '$$\\begin{cases} x+y &= 10 \\\\ x-y &= 2 \\end{cases}$$ 일 때, $x$의 값은?', '6', 85000, 85000, 'Calculation', 4),
('연립방정식 62', '$$\\begin{cases} 2x+y &= 8 \\\\ x+y &= 5 \\end{cases}$$ 일 때, $y$의 값은?', '2', 88000, 88000, 'Calculation', 4),
('연립방정식 63', '$$\\begin{cases} 3x-y &= 7 \\\\ x+y &= 5 \\end{cases}$$ 일 때, $x$의 값은?', '3', 90000, 90000, 'Calculation', 4),
('연립방정식 64', '$$\\begin{cases} x &= y+2 \\\\ 2x+y &= 7 \\end{cases}$$ 일 때, $x$의 값은?', '3', 92000, 92000, 'Calculation', 5),
('연립방정식 65', '$$\\begin{cases} 2x-3y &= 1 \\\\ x+y &= 3 \\end{cases}$$ 일 때, $y$의 값은?', '1', 98000, 98000, 'Calculation', 6),
('연립방정식 활용 66', '닭과 토끼를 합하여 10마리이고, 다리 수의 합이 26개일 때, 토끼는 몇 마리인가?', '3', 105000, 105000, 'Calculation', 7),
('연립방정식 소수 67', '$$\\begin{cases} 0.1x+0.2y &= 0.5 \\\\ x-y &= 2 \\end{cases}$$ 일 때, $x$의 값은?', '3', 108000, 108000, 'Calculation', 7),
('연립방정식 69', '$$\\begin{cases} x+2y &= 7 \\\\ 3x-y &= 7 \\end{cases}$$ 일 때, $x+y$의 값은?', '5', 100000, 100000, 'Calculation', 6),
('연립방정식 활용 70', '사과 2개와 배 1개의 가격은 4000원이고, 사과 1개와 배 2개의 가격은 5000원이다. 사과 1개의 가격은?', '1000', 105000, 105000, 'Calculation', 8),
('연립방정식 기초 71', '$$\\begin{cases} 4x+y &= 13 \\\\ x+y &= 4 \\end{cases}$$ 의 해 $x$는?', '3', 84000, 84000, 'Calculation', 4),
('연립방정식 72', '$$\\begin{cases} x-2y &= -4 \\\\ 2x+y &= 7 \\end{cases}$$ 의 해 $y$는?', '3', 92000, 92000, 'Calculation', 5),
('연립방정식 대입 73', '$$\\begin{cases} y &= 2x-1 \\\\ 3x+y &= 9 \\end{cases}$$ 의 해 $x$는?', '2', 90000, 90000, 'Calculation', 4),
('연립방정식 복잡 74', '$$\\begin{cases} 2(x+y)-x &= 7 \\\\ x-y &= 1 \\end{cases}$$ 의 해 $x$는?', '3', 102000, 102000, 'Calculation', 6),
('연립방정식 소수 75', '$$\\begin{cases} 0.3x+0.1y &= 1.1 \\\\ 0.2x-0.3y &= 0 \\end{cases}$$ 의 해 $x$는?', '3', 110000, 110000, 'Calculation', 7),
('연립방정식 활용 76', '두 수의 합은 25이고 차는 7이다. 두 수 중 큰 수는?', '16', 95000, 95000, 'Calculation', 5),
('연립방정식 특수 77', '$$\\begin{cases} x+y &= 3 \\\\ 2x+2y &= 6 \\end{cases}$$ 의 해의 개수가 무수히 많으면 1, 없으면 0을 입력하시오.', '1', 98000, 98000, 'Calculation', 5),
('연립방정식 활용 78', '어른 2명과 어린이 3명의 입장료는 18000원이고, 어른 3명과 어린이 2명의 입장료는 22000원이다. 어른 1명의 입장료는?', '6000', 120000, 120000, 'Calculation', 10),
('연립방정식 마무리 80', '$$\\begin{cases} ax+by &= 7 \\\\ bx+ay &= 8 \\end{cases}$$ 의 해가 $x=1, y=2$일 때, $a+b$의 값은?', '5', 125000, 125000, 'Calculation', 10),

-- 81-100: 일차함수 & 도형 (중1-2 혼합)
('일차함수 81', '$y = 2x + 3$ 에서 $x=2$ 일 때 $y$의 값은?', '7', 82000, 82000, 'Calculation', 2),
('일차함수 82', '$y = -3x + 1$ 의 기울기는?', '-3', 85000, 85000, 'Calculation', 2),
('일차함수 83', '$y = ax + 5$ 가 점 $(1, 8)$을 지날 때, $a$의 값은?', '3', 90000, 90000, 'Calculation', 4),
('일차함수 84', '$y = 4x - 2$ 의 $y$절편은?', '-2', 80000, 80000, 'Calculation', 2),
('일차함수 85', '$y = 2x - 4$ 의 $x$절편은?', '2', 92000, 92000, 'Calculation', 4),
('일차함수 86', '기울기가 2이고 점 $(0, 3)$을 지나는 일차함수 식 $y=ax+b$에서 $a+b$는?', '5', 95000, 95000, 'Calculation', 5),
('도형 기초 89', '삼각형의 세 내각의 합은 몇 도?', '180', 60000, 60000, 'Calculation', 1),
('도형 기초 90', '이등변삼각형의 두 밑각의 크기는 같다. 한 내각이 80도인 꼭지각일 때 밑각 하나는?', '50', 80000, 80000, 'Calculation', 3),
('일차함수 92', '$y = -x + b$ 가 $(2, 3)$을 지날 때, $b$는?', '5', 88000, 88000, 'Calculation', 3),
('도형 94', '정오각형의 한 내각의 크기는 몇 도?', '108', 110000, 110000, 'Calculation', 6),
('함수 활용 95', '지면에서 100m 올라갈 때마다 기온이 0.6도씩 낮아진다. 현재 지면 기온이 20도일 때, 1000m 높이의 기온은?', '14', 120000, 120000, 'Calculation', 8),
('일차함수 평행 96', '$y = 3x + 1$ 과 평행하고 $(0, -2)$를 지나는 식의 $y$절편은?', '-2', 95000, 95000, 'Calculation', 4),
('도형 98', '반지름이 5cm인 원의 넓이는 $a\pi$ 이다. $a$는?', '25', 85000, 85000, 'Calculation', 3),
('일차함수 99', '두 점 $(1, 2), (3, 6)$을 지나는 직선의 기울기는?', '2', 110000, 110000, 'Calculation', 5),
('마무리 100', 'Logis의 모든 문제를 다 풀 준비가 되었나요? (네=1, 아니오=0)', '1', 50000, 50000, 'Calculation', 1);

-- 문제-태그 연결 (단순화를 위해 일부 수동 매핑 및 대량 삽입)
INSERT INTO problem_tags (problem_id, tag_id) SELECT id, (SELECT id FROM tags WHERE name = '일차방정식') FROM problems WHERE title LIKE '%방정식%' AND title NOT LIKE '%연립%';
INSERT INTO problem_tags (problem_id, tag_id) SELECT id, (SELECT id FROM tags WHERE name = '연립방정식') FROM problems WHERE title LIKE '%연립방정식%';
INSERT INTO problem_tags (problem_id, tag_id) SELECT id, (SELECT id FROM tags WHERE name = '부등식') FROM problems WHERE title LIKE '%부등식%';
INSERT INTO problem_tags (problem_id, tag_id) SELECT id, (SELECT id FROM tags WHERE name = '일차함수') FROM problems WHERE title LIKE '%함수%';
INSERT INTO problem_tags (problem_id, tag_id) SELECT id, (SELECT id FROM tags WHERE name = '식의계산') FROM problems WHERE title LIKE '%계산%';
INSERT INTO problem_tags (problem_id, tag_id) SELECT id, (SELECT id FROM tags WHERE name = '도형') FROM problems WHERE title LIKE '%도형%';

-- Titles Table
CREATE TABLE IF NOT EXISTS titles (
    id SERIAL PRIMARY KEY,
    title_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    condition_type VARCHAR(50) NOT NULL,
    condition_value INTEGER NOT NULL DEFAULT 0
);

-- User Titles Table
CREATE TABLE IF NOT EXISTS user_titles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title_id VARCHAR(50) NOT NULL,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, title_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_title VARCHAR(50);

-- Seed Titles
INSERT INTO titles (title_id, name, description, condition_type, condition_value) VALUES
    ('goose_room', '꽥?', '거위의 방에 방문하세요', 'goose_room', 1),
    ('dark_mode', '어둠의 Logis', '다크 모드를 20회 전환하세요', 'dark_mode', 20),
    ('solve_10', '수학 새싹', '문제 10개를 해결하세요', 'solve_count', 10),
    ('solve_50', '문제 해결사', '문제 50개를 해결하세요', 'solve_count', 50),
    ('solve_100', '수학 마스터', '문제 100개를 해결하세요', 'solve_count', 100),
    ('solve_500', '문제 정복자', '문제 500개를 해결하세요', 'solve_count', 500),
    ('solve_1000', '지식의 전당', '문제 1000개를 해결하세요', 'solve_count', 1000),
    ('streak_7', '꾸준함의 시작', '7일 연속 스트릭을 달성하세요', 'streak', 7),
    ('streak_30', '불굴의 의지', '30일 연속 스트릭을 달성하세요', 'streak', 30),
    ('streak_100', '열정의 소유자', '100일 연속 스트릭을 달성하세요', 'streak', 100),
    ('streak_365', '전설의 꾸준함', '365일 연속 스트릭을 달성하세요', 'streak', 365),
    ('rank_1', '최강자', '랭킹 1위를 달성하세요', 'ranking', 1),
    ('rank_2', '강호', '랭킹 2위를 달성하세요', 'ranking', 2),
    ('rank_3', '도전자', '랭킹 3위를 달성하세요', 'ranking', 3)
ON CONFLICT (title_id) DO NOTHING;

-- Groups Competitions
CREATE TABLE IF NOT EXISTS group_competitions (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    duration_hours INTEGER NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Group Competition Participants
CREATE TABLE IF NOT EXISTS group_competition_participants (
    competition_id INTEGER REFERENCES group_competitions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (competition_id, user_id)
);

