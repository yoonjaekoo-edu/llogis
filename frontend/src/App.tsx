import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { animate, motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import './styles/globals.css';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import GooseRoom from './GooseRoom';
import CatRoom from './CatRoom';

// --- Types ---
interface Problem {
  id: number;
  title: string;
  content: string;
  current_difficulty: number;
  tags: string[];
  custom_reward_rating?: number;
  is_custom?: boolean;
}

interface User {
  id: number;
  username: string;
  rating: number;
  profile_image_url?: string;
  bio?: string;
  streak_repaired?: boolean;
  can_generate_problems?: boolean;
  equipped_title?: string;
  created_at?: string;
  has_firework_effect?: boolean;
  has_developer_chango?: boolean;
  custom_title?: string;
  problems_solved?: number;
  tokens?: number;
  streak?: number;
  xp?: number;
  level?: number;
  tier?: string;
  longest_streak?: number;
  fever_expires_at?: string;
  fever_multiplier?: number;
  profile_theme?: string;
}

// LaTeX Helper
const SafeBlockMath = ({ math, index }: { math: string; index: number }) => {
  try {
    return (
      <div key={index} className="block-math-wrapper">
        <BlockMath math={`\\displaystyle ${math}`} />
      </div>
    );
  } catch {
    return <div key={index} className="block-math-wrapper"><pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left', fontSize: '1rem' }}>{math}</pre></div>;
  }
};

const SafeInlineMath = ({ math, index }: { math: string; index: number }) => {
  try {
    return <InlineMath key={index} math={math} />;
  } catch {
    return <code key={index}>{math}</code>;
  }
};

const renderMath = (content: any) => {
  if (typeof content !== 'string' || !content) return null;
  const sanitizedContent = content.replace(/\\\\/g, '\\');
  const parts = sanitizedContent.split(/(\$\$.*?\$\$|\$.*?\$)/gs);

  return parts.map((part, index) => {
    if (part.startsWith('$$') && part.endsWith('$$')) {
      return <SafeBlockMath key={index} math={part.slice(2, -2).trim()} index={index} />;
    }
    if (part.startsWith('$') && part.endsWith('$')) {
      return <SafeInlineMath key={index} math={part.slice(1, -1).trim()} index={index} />;
    }
    return part.split('\n').map((line, i) => (
      <React.Fragment key={`${index}-${i}`}>
        {line}
        {i < part.split('\n').length - 1 && <br />}
      </React.Fragment>
    ));
  });
};

const SectionReveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, className, style }) => {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-12% 0px -8% 0px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={false}
      animate={inView ? 'visible' : 'hidden'}
      variants={{
        hidden: { opacity: 0, y: reducedMotion ? 0 : 24 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: reducedMotion ? 0 : 0.55, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
};

const CountUp: React.FC<{
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}> = ({ value, duration = 1.5, prefix = '', suffix = '', className }) => {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' });
  const [displayValue, setDisplayValue] = useState(reducedMotion ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reducedMotion) {
      setDisplayValue(value);
      return;
    }

    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate(latest) {
        setDisplayValue(Math.round(latest));
      },
    });

    return () => controls.stop();
  }, [inView, value, duration, reducedMotion]);

  return (
    <span ref={ref} className={className} aria-label={`${value}`}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </span>
  );
};

// --- Components ---

const RadarChart: React.FC<{ data: { tag: string; count: number }[]; maxValue: number }> = ({ data, maxValue }) => {
  if (data.length === 0) return null;
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 110;
  const levels = 5;
  const angleStep = (Math.PI * 2) / data.length;

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / Math.max(maxValue, 1)) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const polygonPoints = data.map((d, i) => {
    const p = getPoint(i, d.count);
    return `${p.x},${p.y}`;
  }).join(' ');

  const gridPolygons = [];
  for (let level = 1; level <= levels; level++) {
    const pts = data.map((_, i) => {
      const p = getPoint(i, (maxValue / levels) * level);
      return `${p.x},${p.y}`;
    }).join(' ');
    gridPolygons.push(pts);
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', margin: '0 auto' }}>
      {gridPolygons.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="var(--border)" strokeWidth="1" opacity={0.5} />
      ))}
      {data.map((_, i) => {
        const p1 = getPoint(i, maxValue);
        const p2 = getPoint((i + 1) % data.length, maxValue);
        return <line key={`axis-${i}`} x1={cx} y1={cy} x2={p1.x} y2={p1.y} stroke="var(--border)" strokeWidth="1" opacity={0.3} />;
      })}
      <polygon points={polygonPoints} fill="var(--color-4)" fillOpacity="0.2" stroke="var(--color-4)" strokeWidth="2" />
      {data.map((d, i) => {
        const p = getPoint(i, d.count);
        return <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--color-4)" />;
      })}
      {data.map((d, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const labelR = radius + 25;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);
        return (
          <text key={`label-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fill="var(--text-main)" fontSize="11" fontWeight={700}>
            {d.tag}
          </text>
        );
      })}
    </svg>
  );
};

const Navbar: React.FC<{ 
  user: User | null; 
  onLogout: () => void; 
  theme: string; 
  toggleTheme: () => void;
  onLogoClick: (e: React.MouseEvent) => void
}> = ({ user, onLogout, theme, toggleTheme, onLogoClick }) => (
  <header role="banner">
    <div className="container">
      <h1>
        <Link to="/" aria-label="Logis 홈으로 이동" onClick={onLogoClick} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', color: 'white', textDecoration: 'none' }}>
          <img src="/logo_new.png" alt="Logis 로고" width="36" height="36" style={{ borderRadius: '8px', objectFit: 'cover' }} />
          <span style={{ letterSpacing: '-1px', fontWeight: 900, fontSize: '1.5rem' }}>Logis</span>
        </Link>
      </h1>
      <nav aria-label="주 메뉴">
        <ul>
          <li><Link to="/">문제</Link></li>
          <li><Link to="/ranking">랭킹</Link></li>
          <li><Link to="/groups">그룹</Link></li>
          <li><Link to="/shop">상점</Link></li>
          <li><Link to="/about">소개</Link></li>
          {user ? (
            <>
              {user.username === 'admin' && <li><Link to="/admin" className="nav-admin-link">관@리</Link></li>}
              <li>
                <Link to="/profile" aria-label={`${user.username} 프로필`} className="nav-user-link">
                  {user.profile_image_url ? (
                    <img src={user.profile_image_url} alt={`${user.username} 프로필`} width="26" height="26" loading="lazy" className="nav-user-avatar" />
                  ) : (
                    <div aria-hidden="true" className="nav-user-avatar-fallback">
                      {user.username[0].toUpperCase()}
                    </div>
                  )}
                  {user.username}
                </Link>
              </li>
              <li><span className="nav-level">Lv.{user.level || 1}</span></li>
              <li><span className="nav-rp">✨ {Math.round(user.rating).toLocaleString()} RP</span></li>
              <li><button onClick={onLogout} aria-label="로그아웃" className="nav-logout-btn">로그아웃</button></li>
            </>
          ) : (
            <>
              <li><Link to="/login" className="nav-auth-link">로그인</Link></li>
              <li><Link to="/signup" className="nav-auth-link">가입</Link></li>
            </>
          )}
          <li>
            <button onClick={toggleTheme} className="theme-toggle" aria-label={theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  </header>
);

const About: React.FC<{ user: User | null }> = ({ user }) => {
  const [pageContent, setPageContent] = useState('');

  useEffect(() => {
    fetch('/api/page-content/about')
      .then(r => r.json())
      .then(data => setPageContent(data.content || ''))
      .catch(() => {});
  }, []);

  return (
    <main className="container" style={{ padding: '4rem 0', maxWidth: '800px' }}>
      <Helmet>
        <title>소개 | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="description" content="Logis는 수학 문제를 풀고 레이팅을 올리는 재미있는 수학 학습 플랫폼입니다. 다양한 난이도의 문제를 도전하고 글로벌 랭킹에 도전하세요." />
        <meta property="og:title" content="소개 | Logis - 수학 문제 풀이 플랫폼" />
        <link rel="canonical" href="https://llogis.xyz/about" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [{
            "@type": "ListItem",
            "position": 1,
            "name": "Logis",
            "item": "https://llogis.xyz"
          }, {
            "@type": "ListItem",
            "position": 2,
            "name": "소개",
            "item": "https://llogis.xyz/about"
          }]
        })}</script>
      </Helmet>
      <article className="problem-card" style={{ textAlign: 'center' }}>
        <img src="/logo_new.png" alt="Logis 로고" loading="lazy" style={{ width: '80px', height: '80px', borderRadius: '1.5rem', marginBottom: '1.5rem', boxShadow: 'var(--card-shadow)' }} />
        <h2 style={{ color: 'var(--color-4)', marginBottom: '1.5rem' }}>About Logis</h2>

        {pageContent ? (
          <div style={{ textAlign: 'left', marginBottom: '2rem', lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: pageContent.replace(/\n/g, '<br>').replace(/## (.+)/g, '<h3>$1</h3>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>') }} />
        ) : (
          <p style={{ marginBottom: '2rem' }}>수학 문제를 풀고 레이팅을 올리는 재미있는 수학 학습 플랫폼입니다.</p>
        )}
      </article>

      {/* ─── AI 프로필 CSS 가이드 ─── */}
      <article className="problem-card" style={{ marginTop: '2rem' }}>
        <h2 style={{ color: 'var(--color-4)', marginBottom: '1rem', textAlign: 'center' }}>🤖 AI로 프로필 CSS 만들기</h2>
        <div style={{ textAlign: 'left', lineHeight: 1.8, fontSize: '0.95rem' }}>
          <p style={{ marginBottom: '1rem' }}>
            프로필 페이지는 CSS 코드로 자유롭게 꾸밀 수 있습니다. AI에게 다음과 같이 요청해보세요:
          </p>
          <pre style={{
            padding: '1rem', borderRadius: '0.75rem', background: 'var(--bg-color)',
            border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.85rem',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '1.5rem'
          }}>
{`프로필 CSS를 만들어줘. 내 프로필 페이지는 다음과 같은 구조로 되어 있어:

- .profile-header-card : 프로필 상단 카드
- .profile-avatar-wrap : 아바타 컨테이너
- .profile-username : 사용자 이름
- .profile-bio : 자기소개
- .profile-tier-badge : 티어 뱃지
- .stat-card-premium : 스탯 카드
- .stat-label, .stat-value, .stat-sub : 스탯 텍스트
- .tier-progress-card : 티어 진행도 카드
- .tier-progress-bar, .tier-progress-fill : 진행도 바
- .activity-timeline, .activity-item : 활동 기록
- .quest-card : 퀘스트 카드
- .profile-edit-btn : 프로필 수정 버튼

CSS 변수:
--bg-color (배경), --card-bg (카드 배경),
--text-main (글자), --text-muted (희미한 글자),
--border (테두리), --color-4 (포인트 색상)

예쁘게 꾸며줘!`}
          </pre>
          <p style={{ marginBottom: '1rem' }}>
            AI가 생성한 CSS 코드를 프로필 페이지 하단의 <strong>프로필 CSS</strong> 섹션에 붙여넣기 하세요.
          </p>
          <h3 style={{ color: 'var(--color-4)', margin: '1.5rem 0 0.8rem' }}>CSS 클래스 목록</h3>
          <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.85rem' }}>
            {[
              ['.profile-header-card', '프로필 상단 카드 전체'],
              ['.profile-avatar-wrap', '아바타 이미지 컨테이너'],
              ['.profile-avatar-img', '아바타 이미지'],
              ['.profile-avatar-fallback', '아바타 대체 텍스트'],
              ['.profile-avatar-glow', '아바타 주변 글로우 효과'],
              ['.profile-username', '사용자 이름'],
              ['.profile-bio', '자기소개'],
              ['.profile-tier-badge', '티어 뱃지'],
              ['.profile-edit-btn', '프로필 수정 버튼'],
              ['.stat-card-premium', '스탯 카드'],
              ['.stat-icon', '스탯 아이콘'],
              ['.stat-label', '스탯 레이블'],
              ['.stat-value', '스탯 값'],
              ['.stat-sub', '스탯 서브텍스트'],
              ['.tier-progress-card', '티어 진행도 카드'],
              ['.tier-progress-bar', '진행도 바 배경'],
              ['.tier-progress-fill', '진행도 바 채움'],
              ['.activity-timeline', '활동 기록 타임라인'],
              ['.activity-item', '활동 기록 항목'],
              ['.quest-card', '퀘스트 카드'],
              ['.quest-card.completed', '완료된 퀘스트 카드'],
              ['.progress-bar', '퀘스트 진행도 바'],
              ['.progress-fill', '퀘스트 진행도 채움'],
            ].map(([cls, desc]) => (
              <div key={cls} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <code style={{ fontWeight: 700, color: 'var(--color-4)', fontSize: '0.82rem', minWidth: '180px' }}>{cls}</code>
                <span style={{ opacity: 0.7 }}>{desc}</span>
              </div>
            ))}
          </div>
          <h3 style={{ color: 'var(--color-4)', margin: '1.5rem 0 0.8rem' }}>CSS 변수</h3>
          <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.85rem' }}>
            {[
              ['--bg-color', '페이지 배경색'],
              ['--card-bg', '카드 배경색'],
              ['--text-main', '기본 글자색'],
              ['--text-muted', '희미한 글자색'],
              ['--border', '테두리 색상'],
              ['--color-4', '포인트/강조 색상'],
              ['--card-shadow', '카드 그림자'],
              ['--radius-sm', '작은 둥근 모서리'],
              ['--radius-md', '중간 둥근 모서리'],
              ['--radius-lg', '큰 둥근 모서리'],
            ].map(([varName, desc]) => (
              <div key={varName} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <code style={{ fontWeight: 700, color: '#e6a800', fontSize: '0.82rem', minWidth: '180px' }}>{varName}</code>
                <span style={{ opacity: 0.7 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </article>
    </main>
  );
};
const Landing: React.FC<{ user: User | null }> = ({ user }) => {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroGlowY = useTransform(scrollYProgress, [0, 1], [0, reducedMotion ? 0 : 120]);
  const heroOrbY = useTransform(scrollYProgress, [0, 1], [0, reducedMotion ? 0 : -80]);
  const heroOrbX = useTransform(scrollYProgress, [0, 1], [0, reducedMotion ? 0 : 50]);
  const [overviewStats, setOverviewStats] = useState({
    totalUsers: 0,
    totalProblems: 0,
    totalSubmissions: 0,
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/stats/overview', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setOverviewStats({
            totalUsers: Number(data.totalUsers) || 0,
            totalProblems: Number(data.totalProblems) || 0,
            totalSubmissions: Number(data.totalSubmissions) || 0,
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const featureItems = [
    { icon: '📈', title: '실시간 레이팅', desc: '문제를 풀 때마다 레이팅이 실시간으로 변동됩니다. 나의 수학 실력을 확인하세요.' },
    { icon: '🔥', title: '연속 스트릭', desc: '매일 1문제 이상 풀면 스트릭이 쌓입니다. 토큰으로 긴급 수리도 가능해요!' },
    { icon: '🪙', title: '토큰 경제', desc: '정답을 맞힐 때마다 토큰을 획득하세요. 스트릭 수리, 혜택 등에 활용할 수 있습니다.' },
    { icon: '📅', title: '일일 퀘스트', desc: '매일 새로운 퀘스트가 갱신됩니다. 완료하면 XP와 토큰을 대량으로 획득할 수 있어요.' },
    { icon: '🏆', title: '티어 시스템', desc: 'Bronze부터 정답까지 14개 티어 — 레이팅이 오를수록 더 높은 티어를 달성하세요.' },
    { icon: '🤖', title: 'AI 문제 생성', desc: 'NVIDIA NIM 기반 AI가 원하는 단원의 문제를 즉시 만들어 드립니다.' },
  ];

  return (
    <main>
      <Helmet>
        <title>홈 | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="description" content="Logis에서 수학 실력을 키우세요. Glicko-2 레이팅, 스트릭, 일일 퀘스트, 토큰 시스템으로 매일 성장합니다." />
      </Helmet>

      {/* ── Hero ── */}
      <section ref={heroRef} className="landing-hero">
        <motion.div
          aria-hidden="true"
          style={{ y: heroGlowY }}
          className="landing-hero-glow"
        />
        <motion.div
          aria-hidden="true"
          style={{ y: heroOrbY, x: heroOrbX }}
          className="landing-hero-orb landing-hero-orb-a"
        />
        <motion.div
          aria-hidden="true"
          style={{ y: heroGlowY, x: heroOrbX }}
          className="landing-hero-orb landing-hero-orb-b"
        />

        <SectionReveal style={{ position: 'relative', zIndex: 1, maxWidth: '720px' }}>
          {user ? (
            <>
              <motion.div
                className="landing-hero-welcome"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              >
                어서 오세요,
              </motion.div>
              <motion.h1
                className="landing-hero-title"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                style={{ willChange: 'transform' }}
              >
                {user.username}!
              </motion.h1>
            </>
          ) : (
            <motion.h1
              className="landing-hero-title"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{ willChange: 'transform' }}
            >
              수학 실력을<br />레이팅으로 증명하세요
            </motion.h1>
          )}
           <motion.p
            className="landing-hero-sub"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.65, delay: 0.08 }}
          >
            {user
              ? '오늘의 퀘스트를 완료하고 스트릭을 이어가세요. 매일 문제를 풀면 레이팅이 오릅니다.'
              : '다양한 수학 문제를 풀고 실력을 키우세요. 매일 문제를 풀어 성장하세요.'}
          </motion.p>

          {user && !user.problems_solved && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              style={{ marginTop: '1rem', padding: '0.7rem 1.2rem', borderRadius: '0.8rem', background: 'rgba(255, 215, 0, 0.12)', border: '1px solid rgba(255, 215, 0, 0.3)', display: 'inline-block' }}
            >
              <span style={{ fontWeight: 700, color: '#ffd700', fontSize: '0.95rem' }}>
                💡 문제를 풀어 RP를 얻고 티어를 올려보세요!
              </span>
            </motion.div>
          )}

          <div className="landing-cta-group">
            <motion.button
              onClick={() => navigate('/solve')}
              className="btn-hero btn-hero-primary"
              whileHover={reducedMotion ? undefined : { scale: 1.04, y: -3 }}
              whileTap={reducedMotion ? undefined : { scale: 0.98 }}
            >
              🧮 문제 풀기
            </motion.button>
            {!user && (
              <motion.button
                onClick={() => navigate('/signup')}
                className="btn-hero btn-hero-secondary"
                whileHover={reducedMotion ? undefined : { scale: 1.04, y: -3 }}
                whileTap={reducedMotion ? undefined : { scale: 0.98 }}
              >
                무료로 시작하기
              </motion.button>
            )}
            {user && (
              <motion.button
                onClick={() => navigate('/profile')}
                className="btn-hero btn-hero-secondary"
                whileHover={reducedMotion ? undefined : { scale: 1.04, y: -3 }}
                whileTap={reducedMotion ? undefined : { scale: 0.98 }}
              >
                내 대시보드
              </motion.button>
            )}
          </div>
        </SectionReveal>
      </section>

      {/* ── Stats strip ── */}
      <SectionReveal className="landing-stats-strip">
        <div className="landing-stats-grid">
          <motion.div className="landing-stat-item" whileHover={reducedMotion ? undefined : { scale: 1.03, y: -4 }}>
            <div className="landing-stat-number">
              <CountUp value={overviewStats.totalUsers} />
            </div>
            <div className="landing-stat-label">활성 사용자</div>
          </motion.div>
          <motion.div className="landing-stat-item" whileHover={reducedMotion ? undefined : { scale: 1.03, y: -4 }}>
            <div className="landing-stat-number">
              <CountUp value={overviewStats.totalProblems} />
            </div>
            <div className="landing-stat-label">문제 수</div>
          </motion.div>
          <motion.div className="landing-stat-item" whileHover={reducedMotion ? undefined : { scale: 1.03, y: -4 }}>
            <div className="landing-stat-number">
              <CountUp value={overviewStats.totalSubmissions} />
            </div>
            <div className="landing-stat-label">누적 제출</div>
          </motion.div>
        </div>
      </SectionReveal>

      {/* ── Features ── */}
      <section className="landing-features">
        <SectionReveal style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            왜 Logis인가?
          </span>
        </SectionReveal>
        <SectionReveal delay={0.05}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 900, margin: '0.5rem 0 0', letterSpacing: '-1px', color: 'var(--text-main)' }}>
            게임처럼 수학을 즐기세요
          </h2>
        </SectionReveal>

        <div className="landing-features-grid">
          {featureItems.map((f, index) => (
            <SectionReveal key={f.title} delay={index * 0.04}>
              <motion.div
                className="feature-card"
                whileHover={reducedMotion ? undefined : { y: -8, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              >
                <span className="feature-icon">{f.icon}</span>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </motion.div>
            </SectionReveal>
          ))}
        </div>
      </section>

      {/* ── Demo Problem Preview ── */}
      {!user && (
        <SectionReveal style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--bg-color)', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            미리보기
          </span>
          <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 900, margin: '0.5rem 0 1.5rem', color: 'var(--text-main)' }}>
            이런 문제를 풀 수 있어요
          </h2>
          <div className="problem-card" style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'left' }}>
            <h3 style={{ color: 'var(--color-4)', marginBottom: '1rem' }}>일차방정식 풀기</h3>
            <div className="math-content" style={{ fontSize: '1.5rem', padding: '1rem 0' }}>
              <BlockMath math="3x + 7 = 22" />
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
              가입하면 30개 이상의 템플릿에서 자동 생성된 끝없는 문제를 풀 수 있습니다
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── Bottom CTA ── */}
      {!user && (
        <SectionReveal style={{ textAlign: 'center', padding: '5rem 1.5rem', background: 'var(--card-bg)', borderTop: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '1rem', color: 'var(--color-4)' }}>
            지금 바로 시작하세요
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '1.05rem' }}>
            무료로 가입하고 수학 문제 풀이를 시작하세요.
          </p>
          <div className="landing-cta-group">
            <motion.button onClick={() => navigate('/signup')} className="btn-hero btn-hero-primary" whileHover={reducedMotion ? undefined : { scale: 1.04, y: -3 }} whileTap={reducedMotion ? undefined : { scale: 0.98 }}>
              🚀 무료 가입
            </motion.button>
            <motion.button onClick={() => navigate('/login')} className="btn-hero btn-hero-secondary" whileHover={reducedMotion ? undefined : { scale: 1.04, y: -3 }} whileTap={reducedMotion ? undefined : { scale: 0.98 }}>
              로그인
            </motion.button>
          </div>
        </SectionReveal>
      )}
    </main>
  );
};


const Groups: React.FC<{ user: User | null }> = ({ user }) => {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const fetchGroups = useCallback(() => {
    const token = localStorage.getItem('token');
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch('/api/groups', { headers })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch groups');
        return data;
      })
      .then(data => {
        setGroups(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setGroups([]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return navigate('/login');
    
    const token = localStorage.getItem('token');
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, description })
    });
    
    const data = await res.json();
    if (res.ok) {
      alert('그룹이 생성되었습니다!');
      setName('');
      setDescription('');
      setShowCreate(false);
      fetchGroups();
    } else {
      alert(data.error);
    }
  };

  const handleJoin = async (e: React.MouseEvent, groupId: number) => {
    e.stopPropagation();
    if (!user) return navigate('/login');
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/groups/${groupId}/join`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      alert('그룹에 가입되었습니다!');
      fetchGroups();
    } else {
      alert(data.error);
    }
  };

  if (loading) return <div className="container" style={{ padding: '4rem', textAlign: 'center' }}>로딩 중...</div>;

  return (
    <main className="container" style={{ padding: '4rem 0' }}>
      <Helmet>
        <title>그룹 | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="description" content="Logis에서 다른 유저들과 그룹을 만들어 함께 수학 문제를 풀고 경쟁해보세요. 그룹 레이팅 경쟁에 참여하세요!" />
        <meta property="og:title" content="그룹 | Logis - 수학 문제 풀이 플랫폼" />
        <link rel="canonical" href={`https://llogis.xyz${location.pathname}`} />
      </Helmet>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <section aria-label="그룹 헤더" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ color: 'var(--color-4)', fontSize: '2.5rem', marginBottom: '0.5rem' }}>유저 그룹</h2>
            <p style={{ opacity: 0.7 }}>다른 유저들과 함께 학습하고 경쟁해보세요.</p>
          </div>
          <button 
            onClick={() => setShowCreate(!showCreate)} 
            className="btn" 
            style={{ background: 'var(--color-3)', color: 'white', width: 'auto' }}
          >
            {showCreate ? '취소' : '그룹 만들기'}
          </button>
        </section>
        {showCreate && (
            <div className="problem-card" style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1.5rem' }}>새 그룹 생성</h3>
              <form onSubmit={handleCreate}>
              <input 
                type="text" 
                placeholder="그룹 이름" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', marginBottom: '1rem' }}
                required 
              />
              <textarea 
                placeholder="그룹 설명" 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', marginBottom: '1rem', minHeight: '100px' }}
              />
              <button type="submit" className="btn" style={{ background: 'var(--color-4)', color: 'white' }}>만들기</button>
            </form>
          </div>
        )}

        <section aria-label="그룹 목록" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {groups.map(g => (
            <div 
              key={g.id} 
              className="problem-card" 
              onClick={() => navigate(`/groups/${g.id}`)}
              style={{ margin: 0, display: 'flex', flexDirection: 'column', cursor: 'pointer', border: g.is_member ? '2px solid var(--color-3)' : g.is_pending ? '2px solid var(--color-2)' : '1px solid var(--border)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ color: 'var(--color-3)', margin: 0 }}>{g.name}</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {g.is_member && <span style={{ background: 'var(--color-3)', color: 'white', fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '1rem', fontWeight: 800 }}>참여 중</span>}
                  {g.is_pending && <span style={{ background: 'var(--color-2)', color: 'white', fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '1rem', fontWeight: 800 }}>가입 대기 중</span>}
                </div>
              </div>
              <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1.5rem', flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {g.description || '설명이 없습니다.'}
              </p>
              <div style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                <div>방장: <b>{g.creator_name}</b></div>
                <div>멤버: <b>{g.member_count}명</b></div>
              </div>
              {!g.is_member && !g.is_pending && (
                <button onClick={(e) => handleJoin(e, g.id)} className="btn" style={{ background: 'var(--color-1)', color: 'white', width: '100%' }}>
                  가입 신청하기
                </button>
              )}
              {g.is_pending && (
                <button disabled className="btn" style={{ background: 'var(--color-2)', color: 'white', width: '100%', opacity: 0.7, cursor: 'not-allowed' }}>
                  승인 대기 중...
                </button>
              )}
            </div>
          ))}
          {groups.length === 0 && <p style={{ textAlign: 'center', gridColumn: '1 / -1', opacity: 0.5 }}>아직 생성된 그룹이 없습니다.</p>}
        </section>
      </div>
    </main>
  );
};

const GroupDetail: React.FC<{ user: User | null }> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Competitions state
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [activeCompId, setActiveCompId] = useState<number | null>(null);
  const [compDetail, setCompDetail] = useState<any>(null);
  const [showCreateComp, setShowCreateComp] = useState(false);
  const [compTitle, setCompTitle] = useState('');
  const [compDesc, setCompDesc] = useState('');
  const [compDuration, setCompDuration] = useState('24'); // default 24 hours
  const [activeTab, setActiveTab] = useState<'members' | 'competitions'>('members');

  const fetchGroupDetail = useCallback(() => {
    const token = localStorage.getItem('token');
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`/api/groups/${id}`, { headers })
      .then(res => res.json())
      .then(data => {
        setGroup(data);
        setLoading(false);
        
        // If owner, fetch join requests
        if (user && data.creator_id === user.id) {
          fetch(`/api/groups/${id}/requests`, { headers })
            .then(res => res.json())
            .then(reqs => {
              if (Array.isArray(reqs)) setRequests(reqs);
            });
        }
      });
  }, [id, user]);

  const fetchCompetitions = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`/api/groups/${id}/competitions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setCompetitions(data);
      })
      .catch(err => console.error(err));
  }, [id]);

  const fetchCompetitionDetail = useCallback((compId: number) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`/api/groups/${id}/competitions/${compId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.error) setCompDetail(data);
      })
      .catch(err => console.error(err));
  }, [id]);

  useEffect(() => {
    fetchGroupDetail();
  }, [fetchGroupDetail]);

  useEffect(() => {
    if (group && group.is_member) {
      fetchCompetitions();
    }
  }, [group, fetchCompetitions]);

  useEffect(() => {
    let interval: any;
    if (activeCompId) {
      fetchCompetitionDetail(activeCompId);
      // Auto refresh leaderboard every 10 seconds
      interval = setInterval(() => {
        fetchCompetitionDetail(activeCompId);
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [activeCompId, fetchCompetitionDetail]);

  const handleJoin = async () => {
    if (!user) return navigate('/login');
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/groups/${id}/join`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message || '가입 신청이 완료되었습니다!');
      fetchGroupDetail();
    } else {
      alert(data.error);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm('정말로 그룹을 탈퇴하시겠습니까?')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/groups/${id}/leave`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      alert('그룹에서 탈퇴하였습니다.');
      navigate('/groups');
    } else {
      alert('탈퇴 실패');
    }
  };

  const handleApprove = async (requestId: number) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/groups/${id}/requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      alert('가입 신청을 승인했습니다.');
      fetchGroupDetail();
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  const handleReject = async (requestId: number) => {
    if (!window.confirm('가입 신청을 거절하시겠습니까?')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/groups/${id}/requests/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      alert('가입 신청을 거절했습니다.');
      fetchGroupDetail();
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  const handleCreateCompetition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return navigate('/login');
    const token = localStorage.getItem('token');

    const res = await fetch(`/api/groups/${id}/competitions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: compTitle,
        description: compDesc,
        durationHours: compDuration
      })
    });

    const data = await res.json();
    if (res.ok) {
      alert('경쟁이 시작되었습니다! 다른 멤버들과 경쟁해보세요.');
      setCompTitle('');
      setCompDesc('');
      setCompDuration('24');
      setShowCreateComp(false);
      fetchCompetitions();
    } else {
      alert(data.error);
    }
  };

  const handleCloseCompDetail = () => {
    setActiveCompId(null);
    setCompDetail(null);
  };

  if (loading) return <div className="container" style={{ padding: '4rem', textAlign: 'center' }}>로딩 중...</div>;
  if (!group || group.error) return <div className="container" style={{ padding: '4rem', textAlign: 'center' }}>그룹을 찾을 수 없습니다.</div>;

  const members = Array.isArray(group.members) ? group.members : [];
  const isMember = group.is_member;
  const isPending = group.is_pending;
  const isOwner = user && group.creator_id === user.id;

  return (
    <main className="container" style={{ padding: '4rem 0' }}>
      <Helmet>
        <title>{group.name} | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="description" content={`${group.name} 그룹 - ${group.description || '설명이 없습니다.'} Logis에서 그룹 멤버들과 함께 수학을 학습하세요.`} />
        <meta property="og:title" content={`${group.name} | Logis`} />
        <link rel="canonical" href={`https://llogis.xyz/groups/${id}`} />
      </Helmet>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <button onClick={() => navigate('/groups')} style={{ background: 'none', border: 'none', color: 'var(--color-3)', cursor: 'pointer', marginBottom: '1rem', fontWeight: 800 }}>← 목록으로 돌아가기</button>
        
        <div className="problem-card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ color: 'var(--color-4)', fontSize: '2.5rem', margin: 0 }}>{group.name}</h2>
            {isMember ? (
              <button onClick={handleLeave} className="btn" style={{ background: '#ff7675', color: 'white', width: 'auto' }}>그룹 탈퇴</button>
            ) : isPending ? (
              <button disabled className="btn" style={{ background: 'var(--color-2)', color: 'white', width: 'auto', opacity: 0.7 }}>가입 대기 중</button>
            ) : (
              <button onClick={handleJoin} className="btn" style={{ background: 'var(--color-1)', color: 'white', width: 'auto' }}>가입 신청하기</button>
            )}
          </div>
          <p style={{ fontSize: '1.1rem', opacity: 0.9, marginBottom: '2rem', lineHeight: 1.6 }}>{group.description || '설명이 없습니다.'}</p>
          <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.05)', borderRadius: '0.5rem', fontSize: '0.9rem' }}>
             방장: <b>{group.creator_name}</b> | 생성일: {new Date(group.created_at).toLocaleDateString()}
          </div>
        </div>

        {isOwner && requests.length > 0 && (
          <div className="problem-card" style={{ marginBottom: '2rem', border: '2px solid var(--color-4)' }}>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--color-4)' }}>가입 신청 관리 ({requests.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {requests.map((r: any) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '0.5rem', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-3)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                      {r.profile_image_url ? <img src={r.profile_image_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : r.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800 }}>{r.username}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleApprove(r.id)} className="btn" style={{ padding: '0.5rem 1rem', width: 'auto', background: 'var(--color-3)', color: 'white', fontSize: '0.9rem' }}>승인</button>
                    <button onClick={() => handleReject(r.id)} className="btn" style={{ padding: '0.5rem 1rem', width: 'auto', background: '#ff7675', color: 'white', fontSize: '0.9rem' }}>거절</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '2px solid var(--border)', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
          <button 
            onClick={() => setActiveTab('members')} 
            style={{ 
              background: 'none', border: 'none', 
              color: activeTab === 'members' ? 'var(--color-4)' : 'var(--text-muted)', 
              fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer',
              borderBottom: activeTab === 'members' ? '3px solid var(--color-4)' : 'none',
              paddingBottom: '0.5rem', marginBottom: '-0.7rem'
            }}
          >
            그룹 멤버 ({members.length})
          </button>
          {isMember && (
            <button 
              onClick={() => setActiveTab('competitions')} 
              style={{ 
                background: 'none', border: 'none', 
                color: activeTab === 'competitions' ? 'var(--color-4)' : 'var(--text-muted)', 
                fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer',
                borderBottom: activeTab === 'competitions' ? '3px solid var(--color-4)' : 'none',
                paddingBottom: '0.5rem', marginBottom: '-0.7rem'
              }}
            >
              레이팅 경쟁 ({competitions.length})
            </button>
          )}
        </div>

        {/* Tab Contents: Members */}
        {activeTab === 'members' && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--color-4)' }}>그룹 멤버 ({members.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {members.map((m: any) => (
                <div key={m.id} onClick={() => navigate(`/users/${m.id}`)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-3)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                    {m.profile_image_url ? (
                      <img src={m.profile_image_url} alt={m.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : m.username[0].toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.username}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Contents: Competitions */}
        {activeTab === 'competitions' && isMember && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--color-4)' }}>진행 중인 레이팅 경쟁</h3>
              <button 
                onClick={() => setShowCreateComp(!showCreateComp)} 
                className="btn" 
                style={{ background: 'var(--color-3)', color: 'var(--color-4)', width: 'auto', padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
              >
                {showCreateComp ? '생성 취소' : '경쟁 주최하기'}
              </button>
            </div>

            {showCreateComp && (
              <form onSubmit={handleCreateCompetition} className="problem-card" style={{ marginBottom: '2rem', border: '1px solid var(--color-3)' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--color-4)' }}>새 경쟁 열기</h4>
                <div style={{ marginBottom: '1rem' }}>
                  <input 
                    type="text" 
                    placeholder="경쟁 제목 (예: 주말 레이팅 대격돌!)" 
                    value={compTitle} 
                    onChange={e => setCompTitle(e.target.value)} 
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)' }}
                    required 
                  />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <textarea 
                    placeholder="경쟁 설명 또는 규칙" 
                    value={compDesc} 
                    onChange={e => setCompDesc(e.target.value)} 
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', minHeight: '80px' }}
                  />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', opacity: 0.8 }}>경쟁 제한 시간 (시간 단위)</label>
                  <select 
                    value={compDuration} 
                    onChange={e => setCompDuration(e.target.value)} 
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)' }}
                  >
                    <option value="1">1시간</option>
                    <option value="3">3시간</option>
                    <option value="6">6시간</option>
                    <option value="12">12시간</option>
                    <option value="24">24시간 (하루)</option>
                    <option value="48">48시간 (이틀)</option>
                    <option value="72">72시간 (사흘)</option>
                    <option value="168">168시간 (일주일)</option>
                  </select>
                </div>
                <button type="submit" className="btn" style={{ background: 'var(--color-4)', color: 'white' }}>대회 시작하기 🚀</button>
              </form>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {competitions.map((comp: any) => {
                const isOngoing = comp.status === 'ongoing';
                const isPending = comp.status === 'pending';
                const isEnded = comp.status === 'ended';

                // Calculate time left
                const endTime = new Date(comp.end_time).getTime();
                const nowTime = new Date().getTime();
                const diffMs = endTime - nowTime;
                let timeLeftStr = '';

                if (isOngoing && diffMs > 0) {
                  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                  timeLeftStr = `종료까지 ${diffHours}시간 ${diffMins}분 남음`;
                } else if (isEnded) {
                  timeLeftStr = '경쟁 종료됨';
                } else if (isPending) {
                  timeLeftStr = '시작 대기 중';
                }

                return (
                  <div 
                    key={comp.id} 
                    className="problem-card" 
                    onClick={() => setActiveCompId(comp.id)}
                    style={{ margin: 0, cursor: 'pointer', border: isOngoing ? '2px solid var(--color-4)' : '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--color-4)' }}>{comp.title}</h4>
                      <span style={{ 
                        fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '1rem', fontWeight: 800, color: 'white',
                        background: isOngoing ? 'var(--color-1)' : isEnded ? 'var(--text-muted)' : 'var(--color-3)'
                      }}>
                        {isOngoing ? '진행 중' : isEnded ? '종료됨' : '대기 중'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1.5rem', flexGrow: 1 }}>
                      {comp.description || '설명이 없습니다.'}
                    </p>
                    <div style={{ fontSize: '0.8rem', borderTop: '1px solid var(--border)', paddingTop: '0.8rem', opacity: 0.9 }}>
                      <div>⏱️ <b>{timeLeftStr}</b></div>
                      <div>👥 참가자: <b>{comp.participant_count}명</b></div>
                    </div>
                  </div>
                );
              })}
              {competitions.length === 0 && (
                <p style={{ opacity: 0.5, textAlign: 'center', gridColumn: '1 / -1', padding: '2rem 0' }}>아직 주최된 경쟁이 없습니다. 첫 경쟁을 주최해보세요!</p>
              )}
            </div>
          </div>
        )}

        {/* Realtime Leaderboard Modal */}
        {activeCompId && compDetail && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000, padding: '1rem', boxSizing: 'border-box'
          }}>
            <div className="problem-card" style={{
              width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
              margin: 0, position: 'relative', border: '2px solid var(--color-4)', boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
              background: 'var(--card-bg)'
            }}>
              <button 
                onClick={handleCloseCompDetail}
                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>

              <h3 style={{ color: 'var(--color-4)', fontSize: '1.8rem', marginBottom: '0.5rem', paddingRight: '2rem' }}>
                {compDetail.competition.title}
              </h3>
              <p style={{ opacity: 0.8, fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                {compDetail.competition.description || '규칙 설명이 없습니다.'}
              </p>

              <div style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.03)', borderRadius: '0.5rem', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                상태: <b>{compDetail.competition.status === 'ongoing' ? '🔴 실시간 진행 중 (10초마다 자동 갱신)' : '🏁 대회 종료됨'}</b><br />
                대회 기간: {new Date(compDetail.competition.start_time).toLocaleString()} ~ {new Date(compDetail.competition.end_time).toLocaleString()} ({compDetail.competition.duration_hours}시간)
              </div>

              <h4 style={{ color: 'var(--color-4)', marginBottom: '1rem' }}>실시간 순위표 (Leaderboard)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {compDetail.leaderboard.map((player: any, idx: number) => {
                  const rank = idx + 1;
                  const isTop3 = rank <= 3;
                  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;

                  return (
                    <div 
                      key={player.user_id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.8rem 1rem', background: 'var(--card-bg)', border: '1px solid var(--border)',
                        borderRadius: '0.8rem', boxShadow: isTop3 ? '0 4px 10px rgba(92, 149, 255, 0.15)' : 'none',
                        borderColor: rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? '#cd7f32' : 'var(--border)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                        <span style={{ fontSize: isTop3 ? '1.5rem' : '1rem', fontWeight: 900, width: '30px', textAlign: 'center' }}>
                          {medal}
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-3)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                          {player.profile_image_url ? (
                            <img src={player.profile_image_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                          ) : player.username[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {player.username}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={handleCloseCompDetail}
                className="btn"
                style={{ background: 'var(--color-4)', color: 'white', marginTop: '2rem' }}
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};


const Ranking: React.FC = () => {
  const [ranks, setRanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetch('/api/users/ranking')
      .then(res => res.json())
      .then(data => {
        setRanks(data);
        setLoading(false);
      });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
    const data = await res.json();
    setSearchResults(data);
  };

  if (loading) return <div className="container" style={{ padding: '4rem', textAlign: 'center' }}>로딩 중...</div>;

  return (
    <main className="container" style={{ padding: '4rem 0' }}>
      <Helmet>
        <title>랭킹 | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="description" content="Logis 사용자 랭킹을 확인하고 검색하세요. Bronze부터 정답까지 다양한 티어의 유저들을 만나보세요." />
        <meta property="og:title" content="랭킹 | Logis - 수학 문제 풀이 플랫폼" />
        <link rel="canonical" href={`https://llogis.xyz${location.pathname}`} />
      </Helmet>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '2rem', textAlign: 'center', color: 'var(--color-4)' }}>사용자 랭킹 및 검색</h2>
        
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '3rem' }}>
          <input 
            type="text" 
            placeholder="사용자 이름 검색..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flexGrow: 1, padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontSize: '1.1rem' }}
          />
          <button type="submit" className="btn" style={{ width: 'auto', padding: '0 2rem', background: 'var(--color-3)', color: 'white' }}>검색</button>
        </form>

        {searchResults !== null && (
          <div className="problem-card" style={{ marginBottom: '3rem' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>검색 결과 ({searchResults.length})</h3>
            {searchResults.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                  {searchResults.map(u => (
                    <div 
                      key={u.id} 
                      onClick={() => navigate(`/users/${u.id}`)}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.05)', borderRadius: '1rem', border: '1px solid var(--border)' }}
                    >
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-3)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                        {u.profile_image_url ? <img src={u.profile_image_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : u.username[0].toUpperCase()}
                      </div>
                      <div style={{ overflow: 'hidden', flexGrow: 1 }}>
                        <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.username}</div>
                        {u.equipped_title && <div style={{ fontSize: '0.7rem', color: 'var(--color-4)', fontWeight: 700 }}>[{u.equipped_title}]</div>}
                        {u.custom_title && <div style={{ fontSize: '0.7rem', color: '#ff6b9d', fontStyle: 'italic' }}>✨ {u.custom_title}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-4)' }}>{Math.round(u.rating).toLocaleString()} RP</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#888' }}>{u.tier}</div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : <p style={{ opacity: 0.5, textAlign: 'center' }}>검색 결과가 없습니다.</p>}
            <button onClick={() => { setSearchResults(null); setSearchQuery(''); }} style={{ background: 'none', border: 'none', color: 'var(--color-4)', cursor: 'pointer', marginTop: '1.5rem', fontWeight: 800 }}>← 전체 랭킹 보기</button>
          </div>
        )}

        {searchResults === null && (
          <div className="problem-card" style={{ margin: 0 }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '2rem', textAlign: 'center', color: 'var(--color-4)' }}>Top 50 랭킹</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '1rem' }}>순위</th>
                    <th style={{ padding: '1rem' }}>사용자</th>
                    <th style={{ padding: '1rem' }}>레이팅</th>
                    <th style={{ padding: '1rem' }}>칭호</th>
                  </tr>
                </thead>
                <tbody>
                  {ranks.map((u, i) => (
                    <tr 
                      key={i} 
                      onClick={() => navigate(`/users/${u.id || 0}`)}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '1.2rem 1rem', fontWeight: 800 }}>
                        {i + 1 === 1 ? '🥇' : i + 1 === 2 ? '🥈' : i + 1 === 3 ? '🥉' : i + 1}
                      </td>
                      <td style={{ padding: '1.2rem 1rem', fontWeight: 600 }}>{u.username}</td>
                      <td style={{ padding: '1.2rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: 'var(--color-4)' }}>{Math.round(u.rating).toLocaleString()} RP</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#888' }}>{u.tier}</div>
                      </td>
                      <td style={{ padding: '1.2rem 1rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.equipped_title && <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-4)' }}>[{u.equipped_title}]</div>}
                        {u.custom_title && <div style={{ fontSize: '0.75rem', color: '#ff6b9d', fontStyle: 'italic' }}>✨ {u.custom_title}</div>}
                        {!u.equipped_title && !u.custom_title && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

const UserProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Profile user={null} setUser={() => {}} readonly profileUserId={parseInt(id || '0', 10)} />;
};

const Admin: React.FC<{ user: User | null }> = ({ user }) => {
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [category, setCategory] = useState('');
  const [nimGenerationCount, setNimGenerationCount] = useState(5);
  const [cleaning, setCleaning] = useState(false);
  const [problems, setProblems] = useState<any[]>([]);
  const [problemsPage, setProblemsPage] = useState(1);
  const [problemsTotalPages, setProblemsTotalPages] = useState(1);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [editingProblem, setEditingProblem] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateRewardDrafts, setTemplateRewardDrafts] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'notifications' | 'templates' | 'bugreports' | 'page-content' | 'tier-config'>('users');
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState<any>({ id: '', unit: '', title: '', difficulty: 10000, variables: {}, constraints: [], problem_template: '', answer_formula: { type: 'expression', value: '' }, concepts: [] });
  const [bugReports, setBugReports] = useState<any[]>([]);
  const [showTemplateJson, setShowTemplateJson] = useState(false);
  const [pageContent, setPageContent] = useState('');
  const [pageContentDraft, setPageContentDraft] = useState('');
  const [savingPageContent, setSavingPageContent] = useState(false);
  const [tierConfigDraft, setTierConfigDraft] = useState<any[]>([]);
  const [savingTierConfig, setSavingTierConfig] = useState(false);
  const tierConfigTiers = useRef<any[]>([]);
  const [selectedUserForSubs, setSelectedUserForSubs] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [subsPage, setSubsPage] = useState(1);
  const [subsTotalPages, setSubsTotalPages] = useState(1);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const fetchUsers = useCallback(() => {
    setLoadingUsers(true);
    const token = localStorage.getItem('token');
    fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (!res.ok) throw new Error('Unauthorized');
      return res.json();
    })
    .then(data => {
      setUsers(data);
      setLoadingUsers(false);
    })
    .catch(() => {
      navigate('/');
    });
  }, [navigate]);

  const fetchTemplates = useCallback(() => {
    setLoadingTemplates(true);
    const token = localStorage.getItem('token');
    fetch('/api/problems/templates', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to load templates');
      return res.json();
    })
    .then(data => {
      if (Array.isArray(data)) {
        setTemplates(data);
        setTemplateRewardDrafts(prev => {
          const next: Record<string, string> = { ...prev };
          data.forEach((t: any) => {
            next[t.id] = String(t.reward_rating ?? t.difficulty ?? 0);
          });
          return next;
        });
      }
      setLoadingTemplates(false);
    })
    .catch(() => {
      setLoadingTemplates(false);
    });
  }, []);

  const fetchNotifications = useCallback(() => {
    const token = localStorage.getItem('token');
    fetch('/api/admin/notifications', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (!res.ok) throw new Error('Unauthorized');
      return res.json();
    })
    .then(data => {
      if (data.notifications) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount || 0);
      }
    })
    .catch(() => {});
  }, []);

  const fetchPageContent = useCallback(async () => {
    try {
      const res = await fetch('/api/page-content/about');
      const data = await res.json();
      setPageContent(data.content || '');
      setPageContentDraft(data.content || '');
    } catch {}
  }, []);

  const handleMarkRead = async (id: number) => {
    const token = localStorage.getItem('token');
    await fetch(`/api/admin/notifications/${id}/read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    fetchNotifications();
  };

  const fetchTierConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/tier-config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const tiers = data.tiers || [];
        setTierConfigDraft(tiers);
        tierConfigTiers.current = JSON.parse(JSON.stringify(tiers));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!user || user.username !== 'admin') {
      navigate('/');
      return;
    }
    fetchUsers();
    fetchTemplates();
    fetchNotifications();
    fetchTierConfig();
    fetchPageContent();
  }, [user, navigate, fetchUsers, fetchTemplates, fetchNotifications, fetchTierConfig, fetchPageContent]);

  const handleSeed = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/admin/seed', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    setMessage(data.message || data.error);
    if (res.ok) fetchUsers();
  };

  const handleReset = async () => {
    if (!window.confirm('정말로 모든 문제와 제출 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    const token = localStorage.getItem('token');
    const res = await fetch('/api/admin/reset', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    setMessage(data.message || data.error);
    if (res.ok) fetchUsers();
  };

  const fetchProblems = useCallback(async () => {
    setLoadingProblems(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/admin/problems?page=${problemsPage}&limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.problems) {
        setProblems(data.problems);
        setProblemsTotalPages(data.pagination.totalPages);
      }
    } catch {}
    setLoadingProblems(false);
  }, [problemsPage]);

  const handleDeleteProblem = async (problemId: number) => {
    if (!window.confirm('이 문제를 삭제하시겠습니까? (제출 기록은 유지됩니다)')) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/problems/${problemId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    setMessage(data.message || data.error);
    if (res.ok) fetchProblems();
  };

  const handleSaveProblem = async () => {
    if (!editingProblem) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/problems/${editingProblem.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: editingProblem.title,
        content: editingProblem.content,
        answer: editingProblem.answer,
        current_difficulty: editingProblem.current_difficulty,
      })
    });
    const data = await res.json();
    setMessage(data.message || data.error);
    if (res.ok) {
      setEditingProblem(null);
      fetchProblems();
    }
  };

  const handleGenerateNim = async () => {
    setGenerating(true);
    setMessage('');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/problems/generate-nim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ count: nimGenerationCount, category: category.trim() || undefined })
      });
      const data = await res.json();
      setMessage(data.message || data.error);
      if (res.ok) fetchUsers();
    } catch {
      setMessage('AI 문제 생성에 실패했습니다.');
    }
    setGenerating(false);
  };

  const handleCleanup = async (tags: string[]) => {
    if (!window.confirm(`"${tags.join(', ')}" 태그가 달린 모든 문제를 삭제하시겠습니까?`)) return;
    setCleaning(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/admin/cleanup-tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tags })
      });
      const data = await res.json();
      setMessage(data.message || data.error);
      if (res.ok) fetchUsers();
    } catch {
      setMessage('삭제에 실패했습니다.');
    }
    setCleaning(false);
  };

  const handleUpdateTokens = async (userId: number, currentTokens: number) => {
    const newTokensStr = window.prompt('새로운 토큰 수를 입력하세요:', currentTokens.toString());
    if (newTokensStr === null) return;
    const newTokens = parseInt(newTokensStr);
    if (isNaN(newTokens)) return alert('올바른 숫자를 입력해주세요.');
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/users/${userId}/tokens`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ tokens: newTokens })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      fetchUsers();
    } else {
      alert(data.error);
    }
  };

  const handleUpdateRating = async (userId: number, currentRating: number) => {
    const newRatingStr = window.prompt('새로운 레이팅을 입력하세요:', currentRating.toString());
    if (newRatingStr === null) return;
    const newRating = parseInt(newRatingStr);
    if (isNaN(newRating)) return alert('올바른 숫자를 입력해주세요.');
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/users/${userId}/rating`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ rating: newRating })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      fetchUsers();
    } else {
      alert(data.error);
    }
  };

  const handleUpdateTemplateReward = async (templateId: string) => {
    const rewardStr = templateRewardDrafts[templateId];
    if (!rewardStr) return;
    const reward = parseInt(rewardStr);
    if (isNaN(reward) || reward < 0) return alert('올바른 값을 입력해주세요.');
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/templates/${templateId}/reward-rating`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ reward_rating: reward })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      fetchTemplates();
    } else {
      alert(data.error);
    }
  };

  const handleUpdateCustomTitle = async (userId: number, currentTitle: string) => {
    const newTitle = window.prompt('커스텀 칭호를 입력하세요 (없으면 빈칸):', currentTitle || '');
    if (newTitle === null) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/users/${userId}/custom-title`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ customTitle: newTitle })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      fetchUsers();
    } else {
      alert(data.error);
    }
  };

  const handleToggleProblemGeneration = async (userId: number, currentValue: boolean) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/users/${userId}/problem-generation`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ canGenerateProblems: !currentValue })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      fetchUsers();
    } else {
      alert(data.error);
    }
  };

  const handleUpdateUsername = async (userId: number, currentUsername: string) => {
    const newUsername = window.prompt('새로운 사용자명을 입력하세요:', currentUsername);
    if (newUsername === null || newUsername.trim() === '') return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/users/${userId}/username`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ username: newUsername.trim() })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      fetchUsers();
    } else {
      alert(data.error);
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!window.confirm(`정말로 ${username} 계정을 삭제하시겠습니까?`)) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      fetchUsers();
    } else {
      alert(data.error);
    }
  };

  const fetchSubmissions = useCallback(async (userId: number, page: number) => {
    setLoadingSubs(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/admin/users/${userId}/submissions?page=${page}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.submissions) {
        setSubmissions(data.submissions);
        setSubsPage(data.pagination.page);
        setSubsTotalPages(data.pagination.totalPages);
      }
    } catch {}
    setLoadingSubs(false);
  }, []);

  const handleViewSubmissions = (u: any) => {
    setSelectedUserForSubs(u);
    setSubsPage(1);
    fetchSubmissions(u.id, 1);
  };

  return (
    <main className="container" style={{ padding: '4rem 0' }}>
      <Helmet>
        <title>관리자 패널 | Logis</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://llogis.xyz${location.pathname}`} />
      </Helmet>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <h2 style={{ color: 'var(--color-4)', marginBottom: '2rem', fontSize: '2.5rem' }}>관리자 패널</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '3rem' }}>
          <div style={{ padding: '1.5rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '1rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>데이터 관리</h3>
            <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>데이터베이스에 새로운 문제 10개를 생성하여 추가합니다.</p>
            <button onClick={handleSeed} className="btn" style={{ background: 'var(--color-2)', color: 'white' }}>
              문제 10개 추가 생성
            </button>
          </div>
          <div style={{ padding: '1.5rem', background: 'var(--card-bg)', border: '1px solid var(--color-4)', borderRadius: '1rem' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--color-4)' }}>템플릿 해결 레이팅</h3>
            <p style={{ marginBottom: '1rem', opacity: 0.8 }}>각 템플릿으로 생성된 문제를 맞혔을 때 지급되는 레이팅을 수정합니다.</p>
            <button onClick={fetchTemplates} className="btn" style={{ background: 'var(--color-4)', color: 'white' }}>
              템플릿 목록 새로고침
            </button>
          </div>
          <div style={{ padding: '1.5rem', background: 'var(--card-bg)', border: '1px solid var(--color-4)', borderRadius: '1rem' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--color-4)' }}>AI 문제 생성 (NVIDIA NIM)</h3>
            <p style={{ marginBottom: '1rem', opacity: 0.8 }}>NVIDIA NIM API로 AI 문제를 생성합니다. 프로필에서 API 키를 먼저 등록하세요.</p>
            <input
              type="text"
              placeholder="카테고리 (자연어 입력, 예: 중학교 2학년 연립방정식)"
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', marginBottom: '1rem', boxSizing: 'border-box' }}
            />
            <input
              type="number"
              min={1}
              max={10}
              value={nimGenerationCount}
              onChange={e => setNimGenerationCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', marginBottom: '1rem', boxSizing: 'border-box' }}
            />
            <button onClick={handleGenerateNim} disabled={generating} className="btn" style={{ background: 'var(--color-4)', color: 'white', opacity: generating ? 0.6 : 1 }}>
              {generating ? '생성 중...' : `🤖 AI 문제 ${nimGenerationCount}개 생성`}
            </button>
          </div>

          <div style={{ padding: '1.5rem', background: 'rgba(255, 200, 100, 0.1)', border: '1px solid #f0ad4e', borderRadius: '1rem' }}>
            <h3 style={{ marginBottom: '1rem', color: '#f0ad4e' }}>태그별 문제 정리</h3>
            <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>특정 태그가 달린 문제를 일괄 삭제합니다.</p>
            <button onClick={() => handleCleanup(['확률'])} disabled={cleaning} className="btn" style={{ background: '#f0ad4e', color: 'white', opacity: cleaning ? 0.6 : 1, marginRight: '0.5rem', marginBottom: '0.5rem' }}>
              {cleaning ? '삭제 중...' : '확률 문제 삭제'}
            </button>
            <button onClick={() => handleCleanup(['통계'])} disabled={cleaning} className="btn" style={{ background: '#f0ad4e', color: 'white', opacity: cleaning ? 0.6 : 1 }}>
              통계 문제 삭제
            </button>
          </div>

          <div style={{ padding: '1.5rem', background: 'rgba(255, 118, 117, 0.1)', border: '1px solid #ff7675', borderRadius: '1rem' }}>
            <h3 style={{ marginBottom: '1rem', color: '#ff7675' }}>위험 구역</h3>
            <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>모든 문제를 삭제하고 초기화합니다. (제출 기록은 유지됩니다)</p>
            <button onClick={handleReset} className="btn" style={{ background: '#ff7675', color: 'white' }}>
              데이터베이스 초기화
            </button>
          </div>
        </div>

        {message && (
          <div style={{ 
            padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', 
            borderRadius: '0.5rem', color: 'var(--color-3)', fontWeight: 600, textAlign: 'center', marginBottom: '2rem'
          }}>
            {message}
          </div>
        )}

        <div className="problem-card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>템플릿 보상 관리</h3>
          <p style={{ marginBottom: '1rem', opacity: 0.8 }}>
            문제 생성기에 사용되는 각 템플릿의 해결 시 레이팅을 조정합니다.
          </p>
          {loadingTemplates ? (
            <p>템플릿 로딩 중...</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
              {templates.map((template) => (
                <div
                  key={template.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 0.5fr auto',
                    gap: '0.75rem',
                    alignItems: 'center',
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    background: 'var(--bg-color)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{template.title}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                      {template.id} · {template.unit || '단원 미지정'}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={templateRewardDrafts[template.id] ?? String(template.reward_rating ?? template.difficulty ?? 0)}
                    onChange={(e) => setTemplateRewardDrafts(prev => ({ ...prev, [template.id]: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateTemplateReward(template.id)}
                    className="btn"
                    style={{ width: 'auto', background: 'var(--color-4)', color: 'white', position: 'relative', zIndex: 1, pointerEvents: 'auto' }}
                  >
                    저장
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '2px solid var(--border)', marginBottom: '2rem', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('users')} style={{ background: 'none', border: 'none', color: activeTab === 'users' ? 'var(--color-4)' : 'var(--text-muted)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', borderBottom: activeTab === 'users' ? '3px solid var(--color-4)' : 'none', paddingBottom: '0.5rem', marginBottom: '-0.7rem' }}>
            사용자 관리 ({users.length})
          </button>
          <button onClick={() => { setActiveTab('notifications'); fetchNotifications(); }} style={{ background: 'none', border: 'none', color: activeTab === 'notifications' ? 'var(--color-4)' : 'var(--text-muted)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', borderBottom: activeTab === 'notifications' ? '3px solid var(--color-4)' : 'none', paddingBottom: '0.5rem', marginBottom: '-0.7rem' }}>
            💕 알림 {unreadCount > 0 && <span style={{ background: '#ff7675', color: 'white', borderRadius: '99px', padding: '0.1rem 0.5rem', fontSize: '0.75rem', marginLeft: '0.3rem' }}>{unreadCount}</span>}
          </button>
          <button onClick={() => { setActiveTab('templates'); fetchTemplates(); }} style={{ background: 'none', border: 'none', color: activeTab === 'templates' ? 'var(--color-4)' : 'var(--text-muted)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', borderBottom: activeTab === 'templates' ? '3px solid var(--color-4)' : 'none', paddingBottom: '0.5rem', marginBottom: '-0.7rem' }}>
            📋 템플릿 ({templates.length})
          </button>
          <button onClick={async () => { setActiveTab('bugreports'); const token = localStorage.getItem('token'); try { const res = await fetch('/api/admin/bug-reports', { headers: { 'Authorization': `Bearer ${token}` } }); if (res.ok) setBugReports(await res.json()); } catch {} }} style={{ background: 'none', border: 'none', color: activeTab === 'bugreports' ? 'var(--color-4)' : 'var(--text-muted)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', borderBottom: activeTab === 'bugreports' ? '3px solid var(--color-4)' : 'none', paddingBottom: '0.5rem', marginBottom: '-0.7rem' }}>
            🐛 버그제보
          </button>
          <button onClick={() => { setActiveTab('tier-config'); fetchTierConfig(); }} style={{ background: 'none', border: 'none', color: activeTab === 'tier-config' ? 'var(--color-4)' : 'var(--text-muted)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', borderBottom: activeTab === 'tier-config' ? '3px solid var(--color-4)' : 'none', paddingBottom: '0.5rem', marginBottom: '-0.7rem' }}>
            ⚙️ 등급 설정
          </button>
          <button onClick={() => { setActiveTab('page-content'); fetchPageContent(); }} style={{ background: 'none', border: 'none', color: activeTab === 'page-content' ? 'var(--color-4)' : 'var(--text-muted)', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', borderBottom: activeTab === 'page-content' ? '3px solid var(--color-4)' : 'none', paddingBottom: '0.5rem', marginBottom: '-0.7rem' }}>
            📝 소개 페이지 편집
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
        <div className="problem-card" style={{ margin: 0 }}>
          {selectedUserForSubs ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>{selectedUserForSubs.username}님의 제출 기록 ({submissions.length > 0 ? `${(subsPage - 1) * 100 + 1}-${(subsPage - 1) * 100 + submissions.length}` : '0'})</h3>
                <button onClick={() => setSelectedUserForSubs(null)} className="btn" style={{ background: 'var(--border)', color: 'var(--text-main)', padding: '0.5rem 1rem', width: 'auto' }}>← 목록으로</button>
              </div>
              {loadingSubs ? <p>로딩 중...</p> : submissions.length === 0 ? (
                <p style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>제출 기록이 없습니다.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.6rem' }}>시간</th>
                        <th style={{ padding: '0.6rem' }}>문제</th>
                        <th style={{ padding: '0.6rem' }}>정답 여부</th>
                        <th style={{ padding: '0.6rem' }}>차이</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((s: any) => {
                        const diff = s.time_diff_seconds;
                        let diffStr = '-';
                        if (diff !== null) {
                          const secs = parseFloat(diff);
                          if (secs < 60) diffStr = `${Math.round(secs)}초`;
                          else if (secs < 3600) diffStr = `${Math.floor(secs / 60)}분 ${Math.round(secs % 60)}초`;
                          else diffStr = `${Math.floor(secs / 3600)}시간 ${Math.floor((secs % 3600) / 60)}분`;
                        }
                        return (
                          <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.6rem', whiteSpace: 'nowrap' }}>{new Date(s.submitted_at).toLocaleString('ko-KR')}</td>
                            <td style={{ padding: '0.6rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.problem_id ? (
                                <a href={`/problem/${s.problem_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-4)', fontWeight: 700, textDecoration: 'none' }}
                                  onClick={e => { e.preventDefault(); navigate(`/problem/${s.problem_id}`); }}>
                                  {s.problem_title || `문제 #${s.problem_id}`}
                                </a>
                              ) : <span style={{ opacity: 0.5 }}>삭제됨</span>}
                            </td>
                            <td style={{ padding: '0.6rem' }}>
                              <span style={{ color: s.is_correct ? '#00b894' : '#ff7675', fontWeight: 800 }}>
                                {s.is_correct ? '✅ 정답' : '❌ 오답'}
                              </span>
                            </td>
                            <td style={{ padding: '0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{diffStr}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {subsTotalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                      {Array.from({ length: subsTotalPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => { setSubsPage(p); fetchSubmissions(selectedUserForSubs.id, p); }}
                          className="btn" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', width: 'auto', background: p === subsPage ? 'var(--color-4)' : 'var(--border)', color: p === subsPage ? 'white' : 'var(--text-main)' }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h3 style={{ marginBottom: '1.5rem' }}>사용자 관리 ({users.length})</h3>
              {loadingUsers ? <p>사용자 목록 로딩 중...</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.6rem' }}>순위</th>
                        <th style={{ padding: '0.6rem' }}>사용자</th>
                        <th style={{ padding: '0.6rem' }}>레이팅</th>
                        <th style={{ padding: '0.6rem' }}>토큰</th>
                        <th style={{ padding: '0.6rem' }}>칭호</th>
                        <th style={{ padding: '0.6rem' }}>정답수</th>
                        <th style={{ padding: '0.6rem' }}>문제 생성</th>
                        <th style={{ padding: '0.6rem' }}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u, i) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.6rem', fontWeight: 800 }}>{i + 1}</td>
                          <td style={{ padding: '0.6rem' }}>
                            <div style={{ fontWeight: 800 }}>{u.username}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{u.email}</div>
                          </td>
                          <td style={{ padding: '0.6rem' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>{Math.round(u.rating).toLocaleString()}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{u.tier}</div>
                          </td>
                          <td style={{ padding: '0.6rem', fontWeight: 800, color: '#e6a800' }}>{(u.tokens || 0).toLocaleString()}</td>
                          <td style={{ padding: '0.6rem', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '0.8rem' }}>{u.custom_title || '-'}</span>
                          </td>
                          <td style={{ padding: '0.6rem', fontSize: '0.85rem' }}>{u.correct_submissions} / {u.total_submissions}</td>
                          <td style={{ padding: '0.6rem' }}>
                            <button
                              onClick={() => handleToggleProblemGeneration(u.id, !!u.can_generate_problems)}
                              className="btn"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', width: 'auto', background: u.can_generate_problems ? '#00b894' : 'var(--border)', color: u.can_generate_problems ? 'white' : 'var(--text-main)' }}
                            >
                              {u.can_generate_problems ? '허용' : '부여'}
                            </button>
                          </td>
                          <td style={{ padding: '0.6rem' }}>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                              <button onClick={() => handleUpdateRating(u.id, u.rating)} className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', width: 'auto', background: 'var(--color-3)', color: 'white' }}>⭐</button>
                              <button onClick={() => handleUpdateTokens(u.id, u.tokens || 0)} className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', width: 'auto', background: '#e6a800', color: 'white' }}>🪙</button>
                              <button onClick={() => handleUpdateCustomTitle(u.id, u.custom_title || '')} className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', width: 'auto', background: 'var(--color-4)', color: 'white' }}>🏷️</button>
                              <button onClick={() => handleUpdateUsername(u.id, u.username)} className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', width: 'auto', background: '#6c5ce7', color: 'white' }}>✏️</button>
                              <button onClick={() => handleViewSubmissions(u)} className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', width: 'auto', background: '#00b894', color: 'white' }}>📋</button>
                              {u.username !== 'admin' && (
                                <button onClick={() => handleDeleteUser(u.id, u.username)} className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', width: 'auto', background: '#ff7675', color: 'white' }}>🗑️</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
        <div className="problem-card" style={{ margin: 0 }}>
          <h3 style={{ marginBottom: '1.5rem' }}>💕 알림 내역 ({notifications.length})</h3>
          {notifications.length === 0 ? (
            <p style={{ opacity: 0.5, textAlign: 'center', padding: '2rem' }}>알림이 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {notifications.map((n: any) => (
                <div key={n.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.8rem 1rem', borderRadius: '0.5rem',
                  background: n.is_read ? 'var(--card-bg)' : 'rgba(255, 118, 117, 0.08)',
                  border: n.is_read ? '1px solid var(--border)' : '1px solid #ff7675'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: n.is_read ? 400 : 800, fontSize: '0.95rem' }}>{n.message}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.3rem' }}>
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  {!n.is_read && (
                    <button onClick={() => handleMarkRead(n.id)} className="btn" style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem', width: 'auto', background: 'var(--color-4)', color: 'white', flexShrink: 0 }}>
                      읽음
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
        <div className="problem-card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>📋 템플릿 관리 ({templates.length})</h3>
            <button onClick={() => { setCreatingTemplate(true); setNewTemplate({ id: '', unit: '', title: '', difficulty: 10000, variables: {}, constraints: [], problem_template: '', answer_formula: { type: 'expression', value: '' }, concepts: [] }); }} className="btn" style={{ background: 'var(--color-4)', color: 'white' }}>
              + 새 템플릿
            </button>
          </div>
          {loadingTemplates ? <p>로딩 중...</p> : (
            <div style={{ display: 'grid', gap: '0.75rem', maxHeight: '600px', overflowY: 'auto' }}>
              {templates.map((template) => (
                <div key={template.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.75rem', alignItems: 'center', padding: '0.75rem', borderRadius: '0.75rem', background: 'var(--bg-color)', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{template.title}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{template.id} · {template.unit || '단원 미지정'} · 난이도: {template.difficulty} · 보상: {template.reward_rating}</div>
                  </div>
                  <button onClick={() => { setEditingTemplate(template); setShowTemplateJson(false); }} className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', width: 'auto', background: 'var(--color-2)', color: 'white' }}>수정</button>
                  <button onClick={async () => {
                    if (!window.confirm(`템플릿 "${template.title}"을(를) 삭제하시겠습니까?`)) return;
                    const token = localStorage.getItem('token');
                    const res = await fetch(`/api/admin/templates/${template.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                    const data = await res.json();
                    alert(data.message || data.error);
                    if (res.ok) fetchTemplates();
                  }} className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', width: 'auto', background: '#ff7675', color: 'white' }}>삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Bug Reports Tab */}
        {activeTab === 'bugreports' && (
        <div className="problem-card" style={{ margin: 0 }}>
          <h3 style={{ marginBottom: '1.5rem' }}>🐛 버그 제보 목록 ({bugReports.length})</h3>
          {bugReports.length === 0 ? (
            <p style={{ opacity: 0.5, textAlign: 'center', padding: '2rem' }}>버그 제보가 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {bugReports.map((r: any) => (
                <div key={r.id} style={{ padding: '0.8rem 1rem', borderRadius: '0.5rem', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{r.title}</div>
                    <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '99px', background: 'rgba(255, 118, 117, 0.15)', color: '#ff7675', fontWeight: 600 }}>{r.category}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.3rem', whiteSpace: 'pre-wrap' }}>{r.description}</div>
                  {r.steps && <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.3rem' }}>재현 방법: {r.steps}</div>}
                  <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                    {r.username} · {new Date(r.created_at).toLocaleString()} · 상태: {r.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
        {activeTab === 'tier-config' && (
          <div className="problem-card" style={{ padding: '1.2rem', margin: 0 }}>
            <h3 style={{ marginBottom: '1rem' }}>⚙️ 등급(티어) 설정</h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '1rem' }}>Real Rating 점수에 따라 등급이 결정됩니다. 등급 이름과 최소 레이팅을 수정할 수 있습니다.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>등급명</th>
                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>최소 레이팅</th>
                  </tr>
                </thead>
                <tbody>
                  {[...tierConfigDraft].sort((a, b) => a.minRating - b.minRating).map((tier, i) => {
                    const realIdx = tierConfigDraft.findIndex(t => t.name === tier.name && t.minRating === tier.minRating);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.4rem 0.6rem' }}>
                          <input value={tierConfigDraft[realIdx]?.name || ''} onChange={e => {
                            const next = [...tierConfigDraft];
                            next[realIdx] = { ...next[realIdx], name: e.target.value };
                            setTierConfigDraft(next);
                          }} style={{ width: 120, padding: '0.3rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)' }} />
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>
                          <input type="number" value={tierConfigDraft[realIdx]?.minRating || 0} onChange={e => {
                            const next = [...tierConfigDraft];
                            next[realIdx] = { ...next[realIdx], minRating: parseInt(e.target.value) || 0 };
                            setTierConfigDraft(next);
                          }} style={{ width: 140, padding: '0.3rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)' }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
              <button onClick={async () => {
                setSavingTierConfig(true);
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch('/api/admin/tier-config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ tiers: tierConfigDraft }),
                  });
                  if (!res.ok) throw new Error('Failed');
                  setMessage('✅ 등급 설정이 저장되었습니다.');
                  fetchTierConfig();
                } catch { setMessage('❌ 저장 실패'); }
                finally { setSavingTierConfig(false); }
              }} disabled={savingTierConfig}
                className="btn" style={{ background: 'var(--color-4)', color: '#fff', border: 'none' }}>
                {savingTierConfig ? '저장 중...' : '등급 설정 저장'}
              </button>
              <button onClick={() => setTierConfigDraft(JSON.parse(JSON.stringify(tierConfigTiers.current)))}
                className="btn" style={{ background: 'var(--color-1)', color: '#fff', border: 'none' }}>
                초기화
              </button>
            </div>
          </div>
        )}
        {activeTab === 'page-content' && (
          <div className="problem-card" style={{ padding: '1.2rem', margin: 0 }}>
            <h3 style={{ marginBottom: '1rem' }}>📝 소개 페이지 편집</h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '0.5rem' }}>마크다운 형식으로 소개 페이지 내용을 편집할 수 있습니다.</p>
            <p style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '1rem' }}>
              <code>## 제목</code> = 제목, <code>**굵게**</code> = 굵게, <code>*기울임*</code> = 기울임, 줄바꿈은 그대로 표시됩니다.
            </p>
            <textarea value={pageContentDraft} onChange={e => setPageContentDraft(e.target.value)}
              style={{ width: '100%', minHeight: '300px', padding: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontFamily: 'monospace', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="소개 페이지 내용을 마크다운 형식으로 입력하세요..." />
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', alignItems: 'center' }}>
              <button onClick={async () => {
                setSavingPageContent(true);
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch('/api/admin/page-content/about', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ content: pageContentDraft }),
                  });
                  if (!res.ok) throw new Error('Failed');
                  setPageContent(pageContentDraft);
                  setMessage('✅ 소개 페이지가 저장되었습니다.');
                } catch { setMessage('❌ 저장 실패'); }
                finally { setSavingPageContent(false); }
              }} disabled={savingPageContent}
                className="btn" style={{ background: 'var(--color-4)', color: '#fff', border: 'none' }}>
                {savingPageContent ? '저장 중...' : '소개 페이지 저장'}
              </button>
              <button onClick={() => setPageContentDraft(pageContent)}
                className="btn" style={{ background: 'var(--color-1)', color: '#fff', border: 'none' }}>
                초기화
              </button>
              <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>변경사항은 소개 페이지(<Link to="/about" target="_blank" style={{ color: 'var(--color-4)' }}>/about</Link>)에서 확인 가능합니다.</span>
            </div>
          </div>
        )}

        {/* Problem Management */}
        <div className="problem-card" style={{ margin: 0, marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>문제 관리 ({problems.length})</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button onClick={() => { setProblemsPage(p => Math.max(1, p - 1)); fetchProblems(); }} disabled={problemsPage <= 1} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: 'auto', background: 'var(--color-3)', color: 'white', opacity: problemsPage <= 1 ? 0.5 : 1 }}>←</button>
              <span style={{ fontSize: '0.85rem' }}>{problemsPage} / {problemsTotalPages}</span>
              <button onClick={() => { setProblemsPage(p => Math.min(problemsTotalPages, p + 1)); fetchProblems(); }} disabled={problemsPage >= problemsTotalPages} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: 'auto', background: 'var(--color-3)', color: 'white', opacity: problemsPage >= problemsTotalPages ? 0.5 : 1 }}>→</button>
              <button onClick={() => fetchProblems()} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: 'auto', background: 'var(--color-2)', color: 'white' }}>새로고침</button>
              <button onClick={async () => {
                if (!window.confirm('양산 문제(is_custom=FALSE)를 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
                const token = localStorage.getItem('token');
                const res = await fetch('/api/admin/problems/delete-mass-produced', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                setMessage(data.message || data.error);
                if (res.ok) fetchProblems();
              }} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: 'auto', background: '#e17055', color: 'white' }}>양산 문제 일괄 삭제</button>
            </div>
          </div>

          {loadingProblems ? <p>로딩 중...</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.6rem' }}>ID</th>
                    <th style={{ padding: '0.6rem' }}>제목</th>
                    <th style={{ padding: '0.6rem' }}>정답</th>
                    <th style={{ padding: '0.6rem' }}>난이도</th>
                    <th style={{ padding: '0.6rem' }}>태그</th>
                    <th style={{ padding: '0.6rem' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((p: any) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.6rem', fontWeight: 800 }}>{p.id}</td>
                      <td style={{ padding: '0.6rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</td>
                      <td style={{ padding: '0.6rem', fontWeight: 600, color: 'var(--color-3)' }}>{p.answer}</td>
                      <td style={{ padding: '0.6rem' }}>{Math.round(p.current_difficulty).toLocaleString()}</td>
                      <td style={{ padding: '0.6rem' }}>
                        {Array.isArray(p.tags) && p.tags.map((t: string) => (
                          <span key={t} style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '0.5rem', background: 'var(--color-3)', color: 'white', marginRight: '0.3rem', fontWeight: 600 }}>{t}</span>
                        ))}
                      </td>
                      <td style={{ padding: '0.6rem' }}>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button onClick={() => setEditingProblem({ ...p, _origContent: p.content })} className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', width: 'auto', background: 'var(--color-2)', color: 'white' }}>수정</button>
                          <button onClick={() => handleDeleteProblem(p.id)} className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', width: 'auto', background: '#ff7675', color: 'white' }}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Problem Modal */}
        {editingProblem && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000, padding: '1rem', boxSizing: 'border-box'
          }}>
            <div className="problem-card" style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', margin: 0, position: 'relative' }}>
              <button onClick={() => setEditingProblem(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              <h3 style={{ color: 'var(--color-4)', marginBottom: '1.5rem' }}>문제 수정 (ID: {editingProblem.id})</h3>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>제목</label>
                <input type="text" value={editingProblem.title} onChange={e => setEditingProblem({ ...editingProblem, title: e.target.value })} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>내용 (LaTeX)</label>
                <textarea value={editingProblem.content} onChange={e => setEditingProblem({ ...editingProblem, content: e.target.value })} rows={5} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>정답</label>
                <input type="text" value={editingProblem.answer} onChange={e => setEditingProblem({ ...editingProblem, answer: e.target.value })} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>난이도</label>
                <input type="number" value={editingProblem.current_difficulty} onChange={e => setEditingProblem({ ...editingProblem, current_difficulty: parseFloat(e.target.value) || 0 })} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleSaveProblem} className="btn" style={{ background: 'var(--color-4)', color: 'white' }}>저장</button>
                <button onClick={() => setEditingProblem(null)} className="btn" style={{ background: 'var(--border)', color: 'var(--text-main)' }}>취소</button>
              </div>
            </div>
          </div>
        )}

        {/* Template Editor Modal */}
        {(editingTemplate || creatingTemplate) && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem', boxSizing: 'border-box' }}>
            <div className="problem-card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', margin: 0, position: 'relative' }}>
              <button onClick={() => { setEditingTemplate(null); setCreatingTemplate(false); }} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              <h3 style={{ color: 'var(--color-4)', marginBottom: '1.5rem' }}>{creatingTemplate ? '새 템플릿 추가' : `템플릿 수정 (${editingTemplate.id})`}</h3>
              <div style={{ marginBottom: '0.5rem', textAlign: 'right' }}>
                <button onClick={() => setShowTemplateJson(!showTemplateJson)} className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', width: 'auto', background: 'var(--color-3)', color: 'white' }}>
                  {showTemplateJson ? '폼 보기' : 'JSON 에디터'}
                </button>
              </div>
              {showTemplateJson ? (
                <div>
                  <textarea value={JSON.stringify(creatingTemplate ? newTemplate : editingTemplate, null, 2)} onChange={e => {
                    try { const parsed = JSON.parse(e.target.value); if (creatingTemplate) setNewTemplate(parsed); else setEditingTemplate(parsed); } catch {}
                  }} rows={25} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }} />
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>ID</label>
                    <input type="text" value={creatingTemplate ? newTemplate.id : editingTemplate.id} onChange={e => creatingTemplate ? setNewTemplate({ ...newTemplate, id: e.target.value }) : setEditingTemplate({ ...editingTemplate, id: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>단원 (unit)</label>
                    <input type="text" value={creatingTemplate ? newTemplate.unit : editingTemplate.unit} onChange={e => creatingTemplate ? setNewTemplate({ ...newTemplate, unit: e.target.value }) : setEditingTemplate({ ...editingTemplate, unit: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>제목 (title)</label>
                    <input type="text" value={creatingTemplate ? newTemplate.title : editingTemplate.title} onChange={e => creatingTemplate ? setNewTemplate({ ...newTemplate, title: e.target.value }) : setEditingTemplate({ ...editingTemplate, title: e.target.value })} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>난이도 (difficulty)</label>
                    <input type="number" value={creatingTemplate ? newTemplate.difficulty : editingTemplate.difficulty} onChange={e => { const v = parseFloat(e.target.value) || 0; if (creatingTemplate) setNewTemplate({ ...newTemplate, difficulty: v }); else setEditingTemplate({ ...editingTemplate, difficulty: v }); }} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>문제 템플릿 (problem_template, {'{{'}변수명{'}}'} 사용)</label>
                    <textarea value={creatingTemplate ? newTemplate.problem_template : editingTemplate.problem_template} onChange={e => creatingTemplate ? setNewTemplate({ ...newTemplate, problem_template: e.target.value }) : setEditingTemplate({ ...editingTemplate, problem_template: e.target.value })} rows={4} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85rem' }} />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>정답 공식 (answer_formula.value)</label>
                    <input type="text" value={creatingTemplate ? newTemplate.answer_formula.value : editingTemplate.answer_formula?.value || ''} onChange={e => { const v = { type: 'expression', value: e.target.value }; if (creatingTemplate) setNewTemplate({ ...newTemplate, answer_formula: v }); else setEditingTemplate({ ...editingTemplate, answer_formula: v }); }} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>변수 (variables, JSON)</label>
                    <textarea value={JSON.stringify(creatingTemplate ? newTemplate.variables : editingTemplate.variables || {}, null, 2)} onChange={e => {
                      try { const parsed = JSON.parse(e.target.value); if (creatingTemplate) setNewTemplate({ ...newTemplate, variables: parsed }); else setEditingTemplate({ ...editingTemplate, variables: parsed }); } catch {}
                    }} rows={5} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }} />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>제약 조건 (constraints, JSON 배열)</label>
                    <textarea value={JSON.stringify(creatingTemplate ? newTemplate.constraints : editingTemplate.constraints || [])} onChange={e => {
                      try { const parsed = JSON.parse(e.target.value); if (Array.isArray(parsed)) { if (creatingTemplate) setNewTemplate({ ...newTemplate, constraints: parsed }); else setEditingTemplate({ ...editingTemplate, constraints: parsed }); } } catch {}
                    }} rows={3} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }} />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.7 }}>개념 (concepts, JSON 배열)</label>
                    <textarea value={JSON.stringify(creatingTemplate ? newTemplate.concepts : editingTemplate.concepts || [])} onChange={e => {
                      try { const parsed = JSON.parse(e.target.value); if (Array.isArray(parsed)) { if (creatingTemplate) setNewTemplate({ ...newTemplate, concepts: parsed }); else setEditingTemplate({ ...editingTemplate, concepts: parsed }); } } catch {}
                    }} rows={2} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button onClick={async () => {
                  const token = localStorage.getItem('token');
                  const data = creatingTemplate ? newTemplate : editingTemplate;
                  const url = creatingTemplate ? '/api/admin/templates' : `/api/admin/templates/${editingTemplate.id}`;
                  const method = creatingTemplate ? 'POST' : 'PUT';
                  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(data) });
                  const result = await res.json();
                  alert(result.message || result.error);
                  if (res.ok) { setEditingTemplate(null); setCreatingTemplate(false); fetchTemplates(); }
                }} className="btn" style={{ background: 'var(--color-4)', color: 'white' }}>
                  {creatingTemplate ? '추가' : '저장'}
                </button>
                <button onClick={() => { setEditingTemplate(null); setCreatingTemplate(false); }} className="btn" style={{ background: 'var(--border)', color: 'var(--text-main)' }}>취소</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

const BugReport: React.FC<{ user: User | null }> = ({ user }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('버그');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setMessage('제목과 설명을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim(), category, description: description.trim(), steps: steps.trim() || undefined })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('✅ 버그 제보가 접수되었습니다. 감사합니다!');
        setTitle('');
        setDescription('');
        setSteps('');
      } else {
        setMessage(data.error || '제보에 실패했습니다.');
      }
    } catch {
      setMessage('네트워크 오류가 발생했습니다.');
    }
    setSubmitting(false);
  };

  if (!user) {
    return (
      <main className="container" style={{ padding: '4rem 0', maxWidth: '700px' }}>
        <Helmet><title>버그 제보 | Logis</title></Helmet>
        <div className="problem-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2 style={{ color: 'var(--color-4)', marginBottom: '1rem' }}>로그인이 필요합니다</h2>
          <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>버그 제보는 로그인 후 이용할 수 있습니다.</p>
          <button onClick={() => navigate('/login')} className="btn" style={{ background: 'var(--color-4)', color: 'white' }}>로그인</button>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ padding: '4rem 0', maxWidth: '700px' }}>
      <Helmet>
        <title>버그 제보 | Logis</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="problem-card">
        <h2 style={{ color: 'var(--color-4)', marginBottom: '0.5rem' }}>🐛 버그 제보</h2>
        <p style={{ marginBottom: '2rem', opacity: 0.8 }}>발견한 버그를 제보해주세요. 소중한 의견은 서비스 개선에 큰 도움이 됩니다.</p>
        {message && (
          <div style={{ padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontWeight: 600, textAlign: 'center', marginBottom: '1.5rem' }}>
            {message}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>제목</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="버그의 제목을 간략히 입력해주세요" style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }} required />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>카테고리</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }}>
              <option value="버그">버그</option>
              <option value="UI/UX">UI/UX 문제</option>
              <option value="문제 오류">문제 오류</option>
              <option value="성능">성능/속도</option>
              <option value="건의사항">건의사항</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>상세 설명</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="버그가 발생한 상황을 자세히 설명해주세요" rows={5} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', resize: 'vertical' }} required />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>재현 방법 <span style={{ opacity: 0.6, fontWeight: 400 }}>(선택사항)</span></label>
            <textarea value={steps} onChange={e => setSteps(e.target.value)} placeholder="버그를 재현하는 방법을 단계별로 알려주세요" rows={3} style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <button type="submit" disabled={submitting} className="btn" style={{ background: 'var(--color-4)', color: 'white', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? '제출 중...' : '버그 제보하기'}
          </button>
        </form>
      </div>
    </main>
  );
};

const ProfileBadges: React.FC<{ user: User | null }> = ({ user }) => {
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/profile/badges', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.badges) setBadges(data.badges);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;

  const unlocked = badges.filter(b => b.unlocked);
  const locked = badges.filter(b => !b.unlocked);

  return (
    <div className="problem-card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ margin: '0 0 1.2rem', color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        🏅 내 뱃지 ({unlocked.length}/{badges.length})
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.6rem' }}>
        {unlocked.map((b: any) => (
          <div key={b.badge_id} style={{
            padding: '0.7rem', borderRadius: '0.75rem', textAlign: 'center',
            background: 'rgba(92,149,255,0.08)', border: '1px solid rgba(92,149,255,0.2)',
            fontWeight: 700
          }} title={b.description}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.2rem' }}>{b.icon}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{b.name}</div>
          </div>
        ))}
        {locked.map((b: any) => (
          <div key={b.badge_id} style={{
            padding: '0.7rem', borderRadius: '0.75rem', textAlign: 'center',
            border: '1px solid var(--border)', opacity: 0.4, fontWeight: 700
          }} title={b.description}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.2rem', filter: 'grayscale(1)' }}>{b.icon}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>🔒 {b.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TitleSection: React.FC<{ user: User | null; setUser: (u: User) => void; refreshKey?: number }> = ({ user, setUser, refreshKey }) => {
  const [titles, setTitles] = useState<any[]>([]);
  const [equippedTitle, setEquippedTitle] = useState('');
  const [equippedTitleName, setEquippedTitleName] = useState('');
  const [loadingTitles, setLoadingTitles] = useState(true);
  const token = localStorage.getItem('token');

  const fetchTitles = useCallback(() => {
    setLoadingTitles(true);
    fetch('/api/titles', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.titles) {
          setTitles(data.titles);
          setEquippedTitle(data.equippedTitle || '');
          const found = data.titles.find((t: any) => t.title_id === data.equippedTitle);
          setEquippedTitleName(found ? found.name : '');
        }
        setLoadingTitles(false);
      })
      .catch(() => setLoadingTitles(false));
  }, [token]);

  useEffect(() => { fetchTitles(); }, [fetchTitles, refreshKey]);

  const handleEquip = async (titleId: string) => {
    const res = await fetch('/api/titles/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ titleId })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setEquippedTitle(data.equippedTitle);
      setEquippedTitleName(data.equippedTitleName || '');
      const updatedUser = { ...user!, equipped_title: data.equippedTitleName || data.equippedTitle };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      fetchTitles();
    } else {
      alert(data.error || '칭호 장착에 실패했습니다.');
    }
  };

  if (loadingTitles) return null;

  return (
    <div className="problem-card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ margin: '0 0 1.2rem', color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        🏆 내 칭호
      </h3>
      {equippedTitle && (
        <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', background: 'rgba(92, 149, 255, 0.1)', borderRadius: '0.5rem', border: '1px solid var(--color-4)', textAlign: 'center' }}>
          <span style={{ fontWeight: 800, color: 'var(--color-4)' }}>장착 중: </span>
          <span style={{ fontWeight: 800 }}>{titles.find((t: any) => t.title_id === equippedTitle)?.name || equippedTitle}</span>
          <button onClick={() => handleEquip('none')} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#ff7675', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>해제</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
        {titles.map((t: any) => {
          const isEquipped = equippedTitle === t.title_id;
          return (
            <div
              key={t.title_id}
              onClick={() => t.unlocked && !isEquipped && handleEquip(t.title_id)}
              style={{
                padding: '0.8rem', borderRadius: '0.75rem', textAlign: 'center', cursor: t.unlocked && !isEquipped ? 'pointer' : 'default',
                border: isEquipped ? '2px solid var(--color-4)' : t.unlocked ? '1px solid var(--color-3)' : '1px solid var(--border)',
                background: isEquipped ? 'rgba(92, 149, 255, 0.1)' : t.unlocked ? 'rgba(92, 149, 255, 0.04)' : 'transparent',
                opacity: t.unlocked ? 1 : 0.4, transition: 'all 0.2s'
              }}
              title={t.description}
            >
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: t.unlocked ? 'var(--color-4)' : 'var(--text-muted)', marginBottom: '0.25rem' }}>
                {t.name}
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.7, color: 'var(--text-muted)' }}>
                {t.unlocked ? (isEquipped ? '장착 중' : '클릭하여 장착') : '🔒 잠김'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Profile: React.FC<{ user: User | null; setUser: (u: User) => void; readonly?: boolean; profileUserId?: number }> = ({ user, setUser, readonly, profileUserId }) => {
  const [profileData, setProfileData] = useState<any>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newProfileImageFile, setNewProfileImageFile] = useState<File | null>(null);
  const [isUpdatingImage, setIsUpdatingImage] = useState(false);
  
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editedUsername, setEditedUsername] = useState('');
  const [editedBio, setEditedBio] = useState('');

  // Profile CSS customization
  const [profileCssDraft, setProfileCssDraft] = useState('');
  const [isEditingCss, setIsEditingCss] = useState(false);
  const [savingCss, setSavingCss] = useState(false);

  // NVIDIA NIM API key state
  const [nimApiKey, setNimApiKey] = useState('');
  const [isEditingNimKey, setIsEditingNimKey] = useState(false);
  const [hasNimKey, setHasNimKey] = useState(false);
  const [titleRefreshKey, setTitleRefreshKey] = useState(0);

  // Streak calendar state
  const [streakHistory, setStreakHistory] = useState<any>(null);
  const [streakOffset, setStreakOffset] = useState(0);

  // Problem type stats for radar chart
  const [problemTypeStats, setProblemTypeStats] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  const uid = readonly ? profileUserId : user?.id;
  useEffect(() => {
    if (!uid) return;
    fetch(`/api/users/${uid}/streak-history?offset=${streakOffset}`)
      .then(res => res.json())
      .then(data => setStreakHistory(data))
      .catch(() => {});
  }, [uid, streakOffset]);

  const navigate = useNavigate();
  const location = useLocation();

  const fetchProfile = useCallback(() => {
    if (readonly) {
      if (!profileUserId) return;
      fetch(`/api/users/${profileUserId}/profile`)
        .then(res => res.json())
        .then(data => {
          if (data.error) return;
          setProfileData(data);
        })
        .catch(() => {});
      return;
    }
    if (!user) return;
    const token = localStorage.getItem('token');
    fetch('/api/users/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) return;
      setProfileData(data);
      setRecentActivities(Array.isArray(data.recentActivities) ? data.recentActivities : []);
      if (!isEditingProfile) {
        setEditedUsername(data.user.username);
        setEditedBio(data.user.bio || '');
      }
      if (!isEditingCss) {
        setProfileCssDraft(data.user.profile_css || '');
      }
      if (data.user) {
        const mergedUser = { ...user!, ...data.user };
        setUser(mergedUser);
        localStorage.setItem('user', JSON.stringify(mergedUser));
      }
    })
    .catch(() => {});

    fetch('/api/users/nim-key/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.hasKey !== undefined) setHasNimKey(data.hasKey);
    })
    .catch(() => {});

    fetch('/api/titles/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({})
    }).then(r => r.json()).then(data => {
      if (data.newlyUnlocked && data.newlyUnlocked.length > 0) {
        setTitleRefreshKey(k => k + 1);
        setTimeout(() => alert(`🎉 새 칭호 획득: ${data.newlyUnlocked.map((t: any) => t.name).join(', ')}`), 1000);
      }
    }).catch(() => {});

    // Fetch problem type stats for radar chart
    const token2 = localStorage.getItem('token');
    fetch('/api/users/problem-type-stats', {
      headers: { 'Authorization': `Bearer ${token2}` }
    })
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) setProblemTypeStats(data);
    })
    .catch(() => {});
  }, [user, readonly, profileUserId]);

  useEffect(() => {
    if (!readonly && !user) {
      navigate('/login');
      return;
    }
    fetchProfile();
  }, [user, navigate, fetchProfile, readonly]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedUsername?.trim()) { alert('사용자 이름을 입력해주세요.'); return; }
    setIsSavingProfile(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username: editedUsername.trim(), bio: editedBio || '' })
      });
      const data = await res.json();
      if (res.ok) {
        setIsEditingProfile(false);
        const updatedUser = {
          ...user!,
          ...(data.user || {}),
          username: data.user?.username || editedUsername.trim(),
          bio: (data.user?.bio ?? editedBio) || '',
        };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        fetchProfile();
      } else {
        alert(data.error || '프로필 업데이트에 실패했습니다.');
      }
    } catch (err) {
      alert('네트워크 오류가 발생했습니다.');
    }
    setIsSavingProfile(false);
  };

  const handleSaveNimKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const res = await fetch('/api/users/nim-key', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ nimApiKey })
    });
    const data = await res.json();
    if (res.ok) {
      alert('NVIDIA NIM API 키가 저장되었습니다.');
      setHasNimKey(true);
      setIsEditingNimKey(false);
    } else {
      alert(data.error);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const res = await fetch('/api/users/change-password', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      alert('비밀번호가 성공적으로 변경되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
      setIsChangingPassword(false);
    } else {
      alert(data.error);
    }
  };

  const handleUpdateProfileImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileImageFile) return;

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('profileImage', newProfileImageFile);

    const res = await fetch('/api/users/profile-image', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      alert('프로필 사진이 변경되었습니다.');
      setIsUpdatingImage(false);
      setNewProfileImageFile(null);
      const updatedUser = { ...user!, profile_image_url: data.profileImageUrl };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      fetchProfile();
    } else {
      alert(data.error || '이미지 변경에 실패했습니다.');
    }
  };

  const handleSaveCss = async () => {
    setSavingCss(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/profile/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ css: profileCssDraft })
      });
      const data = await res.json();
      if (res.ok) {
        alert('프로필 CSS가 저장되었습니다.');
        setIsEditingCss(false);
        fetchProfile();
      } else {
        alert(data.error || 'CSS 저장에 실패했습니다.');
      }
    } catch {
      alert('CSS 저장에 실패했습니다.');
    }
    setSavingCss(false);
  };

  if (!profileData) return <div className="container" style={{ padding: '4rem', textAlign: 'center' }}>로딩 중...</div>;

  const { user: u, stats } = profileData;

  const tierColors: { [key: string]: string } = {
    'Bronze': '#cd7f32', 'Silver': '#c0c0c0', 'Gold': '#ffd700',
    'Platinum': '#e5e4e2', 'Diamond': '#b9f2ff', 'Ruby': '#e0115f',
    'Master': '#800080', 'God': '#ff4500', 'Hacker': '#00ff00',
    '치피치피차파차파': '#ff1493', 'ChatGPT': '#10a37f',
    '출제자': '#ffb300', '주인장': '#6a0dad', '정답': '#00e5ff'
  };
  const tierGlows: { [key: string]: string } = {
    'Bronze': 'rgba(205,127,50,0.3)', 'Silver': 'rgba(192,192,192,0.3)', 'Gold': 'rgba(255,215,0,0.4)',
    'Platinum': 'rgba(229,228,226,0.3)', 'Diamond': 'rgba(185,242,255,0.3)', 'Ruby': 'rgba(224,17,95,0.3)',
    'Master': 'rgba(128,0,128,0.3)', 'God': 'rgba(255,69,0,0.3)', 'Hacker': 'rgba(0,255,0,0.3)',
    '치피치피차파차파': 'rgba(255,20,147,0.3)', 'ChatGPT': 'rgba(16,163,127,0.3)',
    '출제자': 'rgba(255,179,0,0.3)', '주인장': 'rgba(106,13,173,0.3)', '정답': 'rgba(0,229,255,0.4)'
  };
  const streak = u.streak || 0;
  const tierColor = tierColors[u.tier] || 'var(--color-4)';

  return (
    <main className="container" style={{ padding: '3rem 0 5rem', maxWidth: '860px', margin: '0 auto' }}>
      <Helmet>
        <title>내 프로필 | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://llogis.xyz${location.pathname}`} />
      </Helmet>

      {u.profile_css && <style>{u.profile_css}</style>}
      {/* ─── 프로필 헤더 카드 ─── */}
      <div
        className="profile-header-card"
        style={{ '--tier-color': tierColor } as React.CSSProperties}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--mouse-x', `${((e.clientX - rect.left) / rect.width) * 100}%`);
          e.currentTarget.style.setProperty('--mouse-y', `${((e.clientY - rect.top) / rect.height) * 100}%`);
        }}
      >
        {/* 아바타 */}
        <div className="profile-avatar-wrap">
          <div className="profile-avatar-glow" style={{ '--tier-color': tierColor } as React.CSSProperties} />
          {u.profile_image_url ? (
            <img src={u.profile_image_url} alt="프로필" className="profile-avatar-img" />
          ) : (
            <div className="profile-avatar-fallback" style={{ background: `linear-gradient(135deg, ${tierColor}, var(--color-4))` }}>
              {u.username[0].toUpperCase()}
            </div>
          )}
          {!readonly && (
            <button
              onClick={() => setIsUpdatingImage(!isUpdatingImage)}
              style={{ position: 'absolute', bottom: -2, right: -2, background: 'var(--color-4)', border: '3px solid var(--card-bg)', borderRadius: '0.7rem', width: '34px', height: '34px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', zIndex: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', transition: 'transform 0.2s' }}
              title="프로필 사진 변경"
            >
              📷
            </button>
          )}
        </div>

        {!readonly && isUpdatingImage && (
          <form onSubmit={handleUpdateProfileImage} style={{ marginBottom: '1.5rem', maxWidth: '380px', margin: '0 auto 1.5rem' }}>
            <input
              type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
              onChange={e => setNewProfileImageFile(e.target.files?.[0] ?? null)}
              style={{ width: '100%', padding: '0.7rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', marginBottom: '0.5rem', boxSizing: 'border-box' }}
              required
            />
            <button type="submit" className="btn" style={{ background: 'var(--color-4)', color: 'white', padding: '0.6rem', fontSize: '0.9rem' }}>변경 적용</button>
          </form>
        )}

        {!readonly && isEditingProfile ? (
          <form onSubmit={handleUpdateProfile} style={{ maxWidth: '480px', margin: '0 auto 1.5rem' }}>
            <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>사용자 이름</label>
              <input type="text" value={editedUsername} onChange={e => setEditedUsername(e.target.value)}
                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', boxSizing: 'border-box', fontSize: '1rem' }} required />
            </div>
            <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>자기소개</label>
              <textarea value={editedBio} onChange={e => setEditedBio(e.target.value)}
                placeholder="자신을 소개해주세요..."
                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', minHeight: '90px', resize: 'vertical', boxSizing: 'border-box', fontSize: '1rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button type="submit" disabled={isSavingProfile} className="btn" style={{ background: 'var(--color-4)', color: 'white', opacity: isSavingProfile ? 0.6 : 1 }}>{isSavingProfile ? '저장 중...' : '저장'}</button>
              <button type="button" onClick={() => setIsEditingProfile(false)} disabled={isSavingProfile} className="btn" style={{ background: 'var(--border)', color: 'var(--text-main)' }}>취소</button>
            </div>
          </form>
        ) : (
          <>
            <h2 className="profile-username">{u.username}</h2>
            {u.equipped_title && (
              <div style={{ marginBottom: '0.2rem', fontWeight: 700, color: 'var(--color-4)', fontSize: '0.95rem', letterSpacing: '0.03em' }}>
                [{u.equipped_title}]
              </div>
            )}
            {u.custom_title && (
              <div style={{ marginBottom: '0.2rem', fontWeight: 700, color: '#ff6b9d', fontSize: '0.9rem', fontStyle: 'italic' }}>
                ✨ {u.custom_title}
              </div>
            )}
            <div
              className="profile-tier-badge"
              style={{
                background: `${tierColor}22`,
                border: `1.5px solid ${tierColor}`,
                color: tierColor,
                '--tier-glow': tierGlows[u.tier] || 'transparent'
              } as React.CSSProperties}
            >
              🏅 {u.tier}
            </div>
            {u.can_generate_problems && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', borderRadius: '999px', background: 'rgba(122, 209, 81, 0.16)', border: '1px solid rgba(122, 209, 81, 0.4)', color: '#5fae35', fontWeight: 800, fontSize: '0.82rem', marginBottom: '0.5rem' }}>
                문제 생성 권한 보유
              </div>
            )}
            {u.bio && <p className="profile-bio">{u.bio}</p>}
            {!readonly && (
              <button onClick={() => { setEditedUsername(u.username); setEditedBio(u.bio || ''); setIsEditingProfile(true); }} className="profile-edit-btn">
                ✏️ 프로필 수정
              </button>
            )}
          </>
        )}
      </div>

      {/* ─── 스탯 카드 그리드 ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card-premium" style={{ '--stat-accent': 'linear-gradient(90deg, var(--color-4), #7b5ff5)' } as React.CSSProperties}>
          <span className="stat-icon">✨</span>
          <div className="stat-label">레이팅</div>
          <div className="stat-value" style={{ color: 'var(--color-4)' }}>{Math.round(u.rating).toLocaleString()}</div>
          <div className="stat-sub">{u.tier} 등급</div>
        </div>
        <div className="stat-card-premium" style={{ '--stat-accent': 'linear-gradient(90deg, #f87575, #ffa9a3)' } as React.CSSProperties}>
          <span className="stat-icon">🔥</span>
          <div className="stat-label">연속 스트릭</div>
          <div className="stat-value" style={{ color: '#f87575' }}>{u.streak || 0}일</div>
          <div className="stat-sub">최장 {u.longest_streak || 0}일{u.streak_repaired ? ' · 🩹 수리됨' : ''}</div>
        </div>
        <div className="stat-card-premium" style={{ '--stat-accent': 'linear-gradient(90deg, #ffd700, #ffb347)' } as React.CSSProperties}>
          <span className="stat-icon">🪙</span>
          <div className="stat-label">보유 토큰</div>
          <div className="stat-value" style={{ color: '#e6a800' }}>{u.tokens || 0}</div>
          <div className="stat-sub">수리 1회 30토큰</div>
        </div>
        <div className="stat-card-premium" style={{ '--stat-accent': 'linear-gradient(90deg, #00e676, #00bcd4)' } as React.CSSProperties}>
          <span className="stat-icon">⚡</span>
          <div className="stat-label">레벨</div>
          <div className="stat-value" style={{ color: '#00b360' }}>Lv.{u.level || 1}</div>
          <div className="stat-sub">XP {(u.xp || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card-premium" style={{ '--stat-accent': 'linear-gradient(90deg, var(--color-3), var(--color-4))' } as React.CSSProperties}>
          <span className="stat-icon">✅</span>
          <div className="stat-label">정답 문제</div>
          <div className="stat-value">{u.problems_solved}</div>
          <div className="stat-sub">정답률 {Math.round(stats.accuracy)}%</div>
        </div>
      </div>

      {/* ─── 티어 진행도 ─── */}
      <div className="problem-card tier-progress-card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--color-4)', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          🏅 티어 진행도
        </h3>
        {(() => {
          const tierThresholds = [
            { name: '정답', min: 2500000000 }, { name: '주인장', min: 1200000000 },
            { name: '출제자', min: 600000000 }, { name: 'ChatGPT', min: 300000000 },
            { name: '치피치피차파차파', min: 150000000 }, { name: 'Hacker', min: 70000000 },
            { name: 'God', min: 30000000 }, { name: 'Master', min: 12000000 },
            { name: 'Ruby', min: 5000000 }, { name: 'Diamond', min: 2000000 },
            { name: 'Platinum', min: 800000 }, { name: 'Gold', min: 300000 },
            { name: 'Silver', min: 100000 },
          ];
          const rating = u.rating || 0;
          const currentTierIdx = tierThresholds.findIndex(t => rating >= t.min);
          const currentTier = currentTierIdx >= 0 ? tierThresholds[currentTierIdx] : tierThresholds[tierThresholds.length - 1];
          const nextTier = currentTierIdx > 0 ? tierThresholds[currentTierIdx - 1] : null;
          const progress = nextTier ? Math.min(100, ((rating - currentTier.min) / (nextTier.min - currentTier.min)) * 100) : 100;
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{u.tier}</span>
                <span style={{ fontWeight: 800, color: 'var(--color-4)', fontSize: '0.9rem' }}>{Math.round(rating).toLocaleString()} RP</span>
              </div>
              <div className="tier-progress-bar">
                <div className="tier-progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
              </div>
              {nextTier && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>↑ {nextTier.name}</span>
                  <span style={{ fontWeight: 700, color: '#e6a800' }}>{(nextTier.min - rating).toLocaleString()} RP 남음</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="problem-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--color-4)', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          📋 활동 기록
        </h3>
        {recentActivities.length > 0 ? (
          <div className="activity-timeline">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="activity-item">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>
                    {activity.description || '활동 기록'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {activity.created_at ? new Date(activity.created_at).toLocaleString('ko-KR') : ''}
                  </div>
                </div>
                <div className="activity-rp-change" style={{ color: Number(activity.change_amount) >= 0 ? '#5fae35' : '#ff7675' }}>
                  {Number(activity.change_amount) >= 0 ? '+' : ''}
                  {Number(activity.change_amount).toLocaleString()} RP
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--text-muted)', textAlign: 'center' }}>아직 활동 기록이 없습니다.</p>
        )}
      </div>

      <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        {u.last_active_date ? `마지막 활동: ${new Date(u.last_active_date).toLocaleDateString()}` : ''}
      </div>

      {/* ─── 분야별 문제 통계 (다각형 그래프) ─── */}
      <div className="problem-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--color-4)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          📊 분야별 문제 통계
        </h3>
        <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          각 분야별로 푼 문제 수를 다각형 그래프로 표시합니다.
        </p>
        {problemTypeStats.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <RadarChart data={problemTypeStats.map((s: any) => ({ tag: s.tag_name, count: parseInt(s.solved_count) }))} maxValue={Math.max(...problemTypeStats.map((s: any) => parseInt(s.solved_count)), 1)} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem', width: '100%' }}>
              {problemTypeStats.map((s: any) => (
                <div key={s.tag_name} style={{
                  padding: '0.3rem 0.8rem', borderRadius: '99px', background: 'var(--card-bg)',
                  border: '1px solid var(--border)', fontSize: '0.82rem', fontWeight: 700
                }}>
                  {s.tag_name}: <span style={{ color: 'var(--color-4)' }}>{s.solved_count}문제</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0, fontSize: '0.9rem', textAlign: 'center' }}>
            아직 푼 문제가 없습니다. 문제를 풀면 통계가 표시됩니다.
          </p>
        )}
      </div>

      {/* 6-month streak calendar */}
      {
        (() => {
          const historyMap: Record<string, number> = {};
          const repairMap: Record<string, boolean> = {};
          if (streakHistory?.history) {
            for (const h of streakHistory.history) {
              historyMap[h.date] = parseInt(h.solved);
              if (h.has_repair) repairMap[h.date] = true;
            }
          }
          const now = new Date();
          const endM = now.getMonth() - streakOffset * 6;
          const calendarMonths = [];
          for (let i = 5; i >= 0; i--) {
            const m = endM - i;
            const y = now.getFullYear() + Math.floor(m / 12);
            calendarMonths.push({ year: y, month: ((m % 12) + 12) % 12 });
          }
          const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
          return (
            <div className="problem-card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', color: '#5fae35', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📅 스트릭 달력 (6개월)
              </h3>
              <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                연속 {streak}일째 해결 중
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <button onClick={() => setStreakOffset(o => o + 1)} className="btn" style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem', background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
                  ◀ 이전
                </button>
                <span style={{ fontWeight: 800, fontSize: '1rem' }}>
                  {calendarMonths[0].year}.{String(calendarMonths[0].month + 1).padStart(2, '0')} - {calendarMonths[5].year}.{String(calendarMonths[5].month + 1).padStart(2, '0')}
                </span>
                <button onClick={() => streakOffset > 0 && setStreakOffset(o => o - 1)} disabled={streakOffset <= 0} className="btn" style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem', background: 'var(--card-bg)', border: '1px solid var(--border)', color: streakOffset > 0 ? 'var(--text-main)' : 'var(--text-muted)', opacity: streakOffset > 0 ? 1 : 0.5, cursor: streakOffset > 0 ? 'pointer' : 'not-allowed' }}>
                  다음 ▶
                </button>
              </div>
              <div className="streak-calendar-grid">
                {calendarMonths.map(({ year, month }) => {
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const cells: (null | { date: string; day: number; count: number })[] = [];
                  for (let i = 0; i < firstDay; i++) cells.push(null);
                  for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    cells.push({ date: dateStr, day: d, count: historyMap[dateStr] || 0 });
                  }
                  return (
                    <div key={`${year}-${month}`} style={{ minWidth: '110px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.85rem', textAlign: 'center', marginBottom: '0.4rem' }}>
                        {year}.{String(month + 1).padStart(2, '0')}
                      </div>
                      <div className="streak-month-grid">
                        {dayNames.map(dn => (
                          <div key={dn} style={{ fontSize: '0.55rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{dn}</div>
                        ))}
                        {cells.map((cell, i) => (
                          cell ? (
                            <div
                              key={i}
                              title={repairMap[cell.date] ? `${cell.date} - 스트릭 리페어 사용` : `${cell.date} - ${cell.count}문제 해결`}
                              className={`streak-day ${repairMap[cell.date] || cell.count > 0 ? 'has-solved' : ''}`}
                              style={{
                                background: repairMap[cell.date]
                                  ? '#9370db'
                                  : cell.count > 0
                                  ? cell.count >= 5 ? '#7ad151'
                                    : cell.count >= 3 ? '#a8e06a'
                                    : '#d4ed9a'
                                  : 'transparent',
                                color: repairMap[cell.date] || cell.count > 0 ? 'white' : 'var(--text-muted)',
                                fontWeight: repairMap[cell.date] || cell.count > 0 ? 700 : 400
                              }}
                            >
                              {cell.day}
                            </div>
                          ) : (
                            <div key={i} />
                          )
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()
      }

      {/* ─── 일일 퀘스트 ─── */}
      <div className="problem-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1.2rem', color: 'var(--color-4)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          📅 오늘의 퀘스트
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {Array.isArray(u.quests) && u.quests.length > 0 ? (
            <>
              {u.quests.map((quest: any) => {
                const pct = Math.min(100, Math.round((quest.current / quest.target) * 100)) || 0;
                const questColors: any = {
                  solve: 'var(--color-4)',
                  streak: '#f87575',
                  accuracy: '#00e676',
                  earn_xp: '#ffd700',
                  consecutive: '#ff6b9d',
                  perfect: '#9370db',
                };
                return (
                  <div key={quest.id} className={`quest-card${quest.completed ? ' completed' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', textDecoration: quest.completed ? 'line-through' : 'none', color: quest.completed ? 'var(--text-muted)' : 'var(--text-main)' }}>
                        {quest.completed ? '✅' : '🎯'} {quest.title}
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        {quest.current} / {quest.target}{quest.type === 'accuracy' ? '%' : quest.type === 'consecutive' || quest.type === 'perfect' ? '연속' : ''}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: quest.completed ? 'var(--color-4)' : (questColors[quest.type] || 'var(--color-1)') }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', fontSize: '0.78rem', opacity: 0.75 }}>
                      <span>✨ +{quest.xpReward} XP</span>
                      {quest.tokenReward > 0 && <span>🪙 +{quest.tokenReward} 토큰</span>}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0, fontSize: '0.95rem' }}>
              오늘의 퀘스트가 아직 생성되지 않았습니다. 문제를 풀면 퀘스트가 자동으로 시작됩니다!
            </p>
          )}
        </div>
      </div>

      {/* ─── 프로필 CSS ─── */}
      <div className="problem-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1.2rem', color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          🎨 프로필 CSS
        </h3>
        <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '1rem' }}>
          사용자 정의 CSS로 프로필을 자유롭게 꾸며보세요. (예: <code>.profile-username &#123; color: red; &#125;</code>)
        </p>
        {!readonly && isEditingCss ? (
          <div>
            <textarea value={profileCssDraft} onChange={e => setProfileCssDraft(e.target.value)}
              placeholder="/* 여기에 CSS를 입력하세요 */"
              style={{ width: '100%', minHeight: '150px', padding: '0.8rem 1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', fontFamily: 'monospace', fontSize: '0.85rem', boxSizing: 'border-box', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}>
              <button onClick={handleSaveCss} disabled={savingCss} className="btn" style={{ background: 'var(--color-4)', color: 'white', opacity: savingCss ? 0.6 : 1 }}>{savingCss ? '저장 중...' : '저장'}</button>
              <button onClick={() => { setIsEditingCss(false); setProfileCssDraft(u.profile_css || ''); }} className="btn" style={{ background: 'var(--border)', color: 'var(--text-main)' }}>취소</button>
            </div>
          </div>
        ) : (
          <div>
            {u.profile_css ? (
              <pre style={{ padding: '0.8rem 1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-color)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{u.profile_css}</pre>
            ) : (
              <p style={{ opacity: 0.5, fontStyle: 'italic' }}>아직 CSS가 없습니다.</p>
            )}
            {!readonly && (
              <button onClick={() => setIsEditingCss(true)} className="btn" style={{ marginTop: '0.8rem', background: 'var(--color-4)', color: 'white', width: 'auto' }}>{u.profile_css ? '✏️ CSS 수정' : '➕ CSS 추가'}</button>
            )}
          </div>
        )}
      </div>

      {/* ─── 내 뱃지 ─── */}
      <ProfileBadges user={user} />

      {!readonly && (
        <>
        <div className="problem-card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1.2rem', color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🔐 계정 설정
          </h3>

          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            가입일: {new Date(u.created_at).toLocaleDateString()}
          </div>

          <button
            onClick={() => setIsChangingPassword(!isChangingPassword)}
            style={{ background: 'none', border: 'none', color: 'var(--color-4)', cursor: 'pointer', fontWeight: 800, fontSize: '0.95rem', padding: 0, textDecoration: 'underline' }}
          >
            {isChangingPassword ? '취소' : '비밀번호 변경'}
          </button>

          {isChangingPassword && (
            <form onSubmit={handleChangePassword} style={{ marginTop: '1.2rem', maxWidth: '380px' }}>
              <input type="password" placeholder="현재 비밀번호" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', marginBottom: '0.6rem', boxSizing: 'border-box' }} required />
              <input type="password" placeholder="새 비밀번호" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', marginBottom: '0.8rem', boxSizing: 'border-box' }} required />
              <button type="submit" className="btn" style={{ background: 'var(--color-4)', color: 'white', padding: '0.7rem' }}>변경 확인</button>
            </form>
          )}
        </div>

        <TitleSection user={user} setUser={setUser} refreshKey={titleRefreshKey} />

        {/* ─── 개발자의 칭호 ─── */}
        {user?.has_developer_chango && (
          <CustomTitleChango user={user} setUser={setUser} />
        )}

        {/* ─── NVIDIA NIM API 키 ─── */}
        <div className="problem-card">
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            🤖 NVIDIA NIM API 키
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
            {hasNimKey ? '✅ API 키가 등록되어 있습니다. AI 문제 생성 기능을 사용할 수 있습니다.' : 'AI 문제 생성 기능을 사용하려면 NVIDIA NIM API 키를 등록하세요.'}
          </p>
          <button
            onClick={() => setIsEditingNimKey(!isEditingNimKey)}
            className="btn"
            style={{ background: 'var(--card-bg)', border: '1.5px solid var(--color-3)', color: 'var(--color-4)', width: 'auto', padding: '0.55rem 1.4rem', fontSize: '0.9rem' }}
          >
            {isEditingNimKey ? '취소' : hasNimKey ? 'API 키 변경' : 'API 키 등록'}
          </button>
          {isEditingNimKey && (
          <form onSubmit={handleSaveNimKey} style={{ marginTop: '1.2rem', maxWidth: '480px' }}>
            <input
              type="password" placeholder="NVIDIA NIM API 키 (nvapi-...)"
              value={nimApiKey} onChange={e => setNimApiKey(e.target.value)}
              style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', marginBottom: '0.8rem', boxSizing: 'border-box' }}
              required
            />
            <button type="submit" className="btn" style={{ background: 'var(--color-4)', color: 'white', padding: '0.7rem' }}>저장</button>
          </form>
        )}
      </div>
        </>
      )}
    </main>
  );
};
const CustomTitleChango: React.FC<{ user: User | null; setUser: (u: User) => void }> = ({ user, setUser }) => {
  const [customTitleInput, setCustomTitleInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState('');

  const handleSubmitCustomTitle = async () => {
    if (!customTitleInput.trim()) { alert('칭호 문구를 입력해주세요.'); return; }
    setSending(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/store/submit-custom-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ customTitle: customTitleInput.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setSentMessage('✅ 맞춤형 칭호가 전송되었습니다! 관리자가 확인 후 적용합니다.');
        setCustomTitleInput('');
      } else {
        setSentMessage(`❌ ${data.error}`);
      }
    } catch {
      setSentMessage('❌ 네트워크 오류가 발생했습니다.');
    }
    setSending(false);
  };

  return (
    <div className="problem-card">
      <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        🎫 개발자의 칭호
      </h3>
      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
        원하는 맞춤형 칭호 문구를 입력하면 관리자에게 전송됩니다. 관리자가 확인 후 적용해드립니다!
      </p>
      {sentMessage && (
        <div style={{ padding: '0.7rem 1rem', background: 'rgba(92, 149, 255, 0.1)', border: '1px solid var(--color-4)', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600 }}>{sentMessage}</div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '480px' }}>
        <input
          type="text" placeholder="예: Logis의 전설, 수학천재, 야옹..."
          value={customTitleInput} onChange={e => setCustomTitleInput(e.target.value)}
          maxLength={50}
          style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: '0.5rem', border: '1.5px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.95rem', boxSizing: 'border-box' }}
          disabled={sending}
        />
        <button onClick={handleSubmitCustomTitle} disabled={sending} className="btn" style={{ background: 'var(--color-4)', color: 'white', width: 'auto', padding: '0.7rem 1.4rem', whiteSpace: 'nowrap' }}>
          {sending ? '전송 중...' : '전송'}
        </button>
      </div>
    </div>
  );
};

const FireworkEffect: React.FC<{ active: boolean; onComplete: () => void }> = ({ active, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff', '#ff8800', '#ff0088', '#ffffff'];
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];

    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4
      });
    }

    let animationId: number;
    const startTime = Date.now();
    const duration = 1000;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;
      if (progress >= 1) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onCompleteRef.current();
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life = 1 - progress;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + 0.7 * p.life), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      animationId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationId);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: 9999
      }}
    />
  );
};

const WrongAnswerGlow: React.FC<{ trigger: number }> = ({ trigger }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, [trigger]);

  if (!visible) return null;
  return (
    <div
      className="wrong-answer-glow"
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: 9998
      }}
    />
  );
};

const ProblemList: React.FC<{ user: User | null; setUser: (u: User) => void }> = ({ user, setUser }) => {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{[key: number]: string}>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generationCount, setGenerationCount] = useState(5);
  const [problemType, setProblemType] = useState<'normal' | 'custom'>('normal');
  const [templateMode, setTemplateMode] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [selectedConcept, setSelectedConcept] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [showFirework, setShowFirework] = useState(false);
  const [wrongGlowTrigger, setWrongGlowTrigger] = useState(0);
  const [lastWrongAnswer, setLastWrongAnswer] = useState<{problemId: number} | null>(null);
  const [lastCorrectFeedback, setLastCorrectFeedback] = useState<{rpGained: number} | null>(null);
  // Custom problem creation (admin only)
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [customAnswer, setCustomAnswer] = useState('');
  const [customRewardRating, setCustomRewardRating] = useState(10000);
  const navigate = useNavigate();
  const location = useLocation();

  // Fetch all available tags
  useEffect(() => {
    fetch('/api/problems/tags')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAllTags(data);
        }
      });
  }, []);

  // Fetch template metadata
  useEffect(() => {
    fetch('/api/problems/templates')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setTemplates(data);
      });
    fetch('/api/problems/templates/units')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setUnits(data);
      });
    fetch('/api/problems/templates/concepts')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setConcepts(data);
      });
  }, []);

  const fetchProblems = () => {
    setLoadingProblems(true);
    const token = localStorage.getItem('token');
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const p = page;
    const t = problemType;

    fetch(`/api/problems?page=${p}&limit=10&type=${t}`, { headers })
      .then(res => res.json())
      .then(data => {
        if (data.problems) {
          setProblems(data.problems);
          setTotalPages(data.pagination?.totalPages || 1);
          setSelectedProblemId(prev => data.problems.some((prob: Problem) => prob.id === prev) ? prev : (data.problems.length > 0 ? data.problems[0].id : null));
        }
        setLoadingProblems(false);
      })
      .catch(() => setLoadingProblems(false));
  };

  useEffect(() => { fetchProblems(); }, [page, problemType]);

  const handleInputChange = (id: number, val: string) => {
    setAnswers(prev => ({ ...prev, [id]: val }));
  };

  const handleSubmit = (problemId: number) => {
    if (!user) return navigate('/login');

    const userAnswer = answers[problemId];
    if (!userAnswer || userAnswer.trim() === '') return alert('정답을 입력해주세요!');

    const token = localStorage.getItem('token');
    fetch('/api/submissions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ problemId, userAnswer })
    })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) {
        alert(data.error || '제출 처리 중 오류가 발생했습니다.');
        return;
      }
      if (data.isCorrect) {
        setShowFirework(true);
        setLastWrongAnswer(null);
        const rpGained = Math.round(data.newUserRating - user.rating);
        setLastCorrectFeedback({ rpGained });
        setTimeout(() => setLastCorrectFeedback(null), 4000);
        fetchProblems();
      } else {
        setWrongGlowTrigger(prev => prev + 1);
        setLastWrongAnswer({ problemId });
      }
      
      const updatedUser: any = { 
        ...user, 
        rating: data.newUserRating,
        tier: data.tier,
        problems_solved: data.problems_solved
      };
      if (data.tokens !== undefined) updatedUser.tokens = data.tokens;
      if (data.streak !== undefined) updatedUser.streak = data.streak;
      if (data.xp !== undefined) updatedUser.xp = data.xp;
      if (data.level !== undefined) updatedUser.level = data.level;
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setAnswers(prev => ({ ...prev, [problemId]: '' }));
    })
    .catch(() => alert('네트워크 오류가 발생했습니다.'));
  };

  const handleGenerate = () => {
    setShowGenerateModal(true);
  };

  const confirmGenerate = () => {
    const token = localStorage.getItem('token');
    fetch('/api/problems/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tags: selectedTags, count: generationCount })
    })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) { alert(data.error || '문제 생성에 실패했습니다.'); return; }
      if (data.problems && data.problems.length > 0) {
        setProblems(data.problems);
        setSelectedProblemId(data.problems[0].id);
        setShowGenerateModal(false);
        setPage(1);
      } else {
        alert('생성된 문제가 없습니다.');
      }
    });
  };

  const confirmGenerateTemplate = () => {
    const token = localStorage.getItem('token');
    const body: any = { count: generationCount };
    if (selectedTemplateIds.length > 0) body.templateIds = selectedTemplateIds;
    else if (selectedUnit) body.unit = selectedUnit;
    else if (selectedConcept) body.concept = selectedConcept;
    fetch('/api/problems/templates/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) { alert(data.error || '템플릿 문제 생성에 실패했습니다.'); return; }
      if (data.problems && data.problems.length > 0) {
        setProblems(data.problems);
        setSelectedProblemId(data.problems[0].id);
        setShowGenerateModal(false);
        setPage(1);
      } else {
        alert('생성된 문제가 없습니다.');
      }
    });
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.username !== 'admin') return;
    const token = localStorage.getItem('token');
    const res = await fetch('/api/problems/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title: customTitle,
        content: customContent,
        answer: customAnswer,
        ratingReward: customRewardRating,
        tags: []
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert('커스텀 문제가 생성되었습니다.');
      setShowCustomForm(false);
      setCustomTitle('');
      setCustomContent('');
      setCustomAnswer('');
      setCustomRewardRating(10000);
      setPage(1);
      fetchProblems();
    } else {
      alert(data.error);
    }
  };

  const selectedProblem = problems.find(p => p.id === selectedProblemId);

  return (
    <main className="container problem-layout">
      <FireworkEffect active={showFirework} onComplete={() => setShowFirework(false)} />
      <WrongAnswerGlow trigger={wrongGlowTrigger} />
      <Helmet>
        <title>문제 풀기 | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="description" content="Logis에서 다양한 수학 문제를 풀고 레이팅을 올리세요." />
        <meta property="og:title" content="문제 풀기 | Logis - 수학 문제 풀이 플랫폼" />
        <link rel="canonical" href={`https://llogis.xyz${location.pathname}`} />
      </Helmet>
      {user?.fever_expires_at && new Date(user.fever_expires_at) > new Date() && (
        <div style={{ textAlign: 'center', padding: '0.6rem', background: 'linear-gradient(90deg, #ff6b6b22, #ff6b6b44, #ff6b6b22)', border: '1px solid #ff6b6b', borderRadius: '0.5rem', marginBottom: '1rem', fontWeight: 800, color: '#ff6b6b', fontSize: '1.1rem' }}>
          🔥 {user.fever_multiplier}배 피버타임 활성중! — <FeverTimer expiresAt={user.fever_expires_at} />
        </div>
      )}
      <nav className="problem-sidebar" aria-label="문제 목록" style={{ width: '300px', flexShrink: 0 }}>
        {/* 탭: 일반 / 커스텀 */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => { setProblemType('normal'); setPage(1); }} className="btn" style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.8rem', background: problemType === 'normal' ? 'var(--color-4)' : 'var(--card-bg)', color: problemType === 'normal' ? 'white' : 'var(--text-main)', border: '1px solid var(--border)' }}>
            일반 문제
          </button>
          <button onClick={() => { setProblemType('custom'); setPage(1); }} className="btn" style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.8rem', background: problemType === 'custom' ? 'var(--color-4)' : 'var(--card-bg)', color: problemType === 'custom' ? 'white' : 'var(--text-main)', border: '1px solid var(--border)' }}>
            커스텀 문제
          </button>
        </div>

        <button onClick={() => {
          const sorted = [...problems].sort((a, b) => a.current_difficulty - b.current_difficulty);
          if (sorted.length > 0) setSelectedProblemId(sorted[0].id);
        }} className="btn" style={{ width: 'auto', padding: '0.3rem 0.8rem', fontSize: '0.75rem', marginBottom: '0.5rem', background: 'var(--color-3)', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700 }}>
          쉬운 문제부터 ▶
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ color: 'var(--color-4)', margin: 0 }}>문제 목록 ({problems.length})</h3>
          {problemType === 'normal' && (user?.username === 'admin' || user?.can_generate_problems) && (
            <button onClick={handleGenerate} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', width: 'auto', background: 'var(--color-2)', color: 'white' }}>
              생성하기
            </button>
          )}
          {problemType === 'custom' && user?.username === 'admin' && (
            <button onClick={() => setShowCustomForm(!showCustomForm)} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', width: 'auto', background: 'var(--color-4)', color: 'white' }}>
              {showCustomForm ? '취소' : '+ 추가'}
            </button>
          )}
        </div>

        {/* 커스텀 문제 생성 폼 (admin only) */}
        {showCustomForm && user?.username === 'admin' && (
          <form onSubmit={handleCreateCustom} className="problem-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.8rem', color: 'var(--color-4)' }}>새 커스텀 문제</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.8rem' }}>
              수식은 LaTeX 형식으로 작성하세요. 인라인 수식은 <code>$...$</code>, 블록 수식은 <code>$$...$$</code>를 사용합니다.
            </p>
            <input type="text" placeholder="제목" value={customTitle} onChange={e => setCustomTitle(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', marginBottom: '0.5rem', boxSizing: 'border-box', fontSize: '0.85rem' }} />
            <textarea placeholder="문제 내용 (예: $x^2 + 2x + 1 = 0$을 푸시오.)" value={customContent} onChange={e => setCustomContent(e.target.value)} required rows={4} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', marginBottom: '0.5rem', boxSizing: 'border-box', fontSize: '0.85rem', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input type="text" placeholder="정답" value={customAnswer} onChange={e => setCustomAnswer(e.target.value)} required style={{ flex: 1, padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', fontSize: '0.85rem' }} />
              <input type="number" placeholder="획득 레이팅" value={customRewardRating} onChange={e => setCustomRewardRating(parseInt(e.target.value) || 0)} style={{ width: '120px', padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box', fontSize: '0.85rem' }} />
            </div>
            <button type="submit" className="btn" style={{ padding: '0.5rem', fontSize: '0.85rem', background: 'var(--color-4)', color: 'white' }}>생성하기</button>
          </form>
        )}
        
        <div role="listbox" aria-label="문제 선택" style={{ maxHeight: '50vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '1rem', background: 'var(--card-bg)' }}>
          {loadingProblems ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>로딩 중...</div>
          ) : (
            problems.map(p => (
              <div 
                key={p.id} 
                onClick={() => setSelectedProblemId(p.id)}
                style={{ 
                  padding: '0.8rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  background: selectedProblemId === p.id ? 'var(--color-3)' : 'transparent',
                  color: selectedProblemId === p.id ? 'var(--color-4)' : 'inherit',
                  fontWeight: selectedProblemId === p.id ? 800 : 400
                }}
              >
                <div style={{ fontSize: '0.9rem' }}>{p.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', color: '#e6a800' }}>
                    +{(p.current_difficulty as number).toLocaleString()} RP
                  </span>
                  {(() => {
                    const diff = p.current_difficulty as number;
                    if (diff <= 30000) return <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#00c853', padding: '0.1rem 0.4rem', borderRadius: '99px', background: 'rgba(0,200,83,0.12)', border: '1px solid rgba(0,200,83,0.25)' }}>⭐ 쉬움</span>;
                    if (diff <= 70000) return <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#ffc107', padding: '0.1rem 0.4rem', borderRadius: '99px', background: 'rgba(255,193,7,0.12)', border: '1px solid rgba(255,193,7,0.25)' }}>⭐⭐ 보통</span>;
                    if (diff <= 120000) return <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#ff6d00', padding: '0.1rem 0.4rem', borderRadius: '99px', background: 'rgba(255,109,0,0.12)', border: '1px solid rgba(255,109,0,0.25)' }}>⭐⭐⭐ 어려움</span>;
                    return <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#d50000', padding: '0.1rem 0.4rem', borderRadius: '99px', background: 'rgba(213,0,0,0.12)', border: '1px solid rgba(213,0,0,0.25)' }}>⭐⭐⭐⭐ 매우어려움</span>;
                  })()}
                </div>
              </div>
            ))
          )}
          {!loadingProblems && problems.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>표시할 문제가 없습니다.</p>
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn" style={{ width: 'auto', padding: '0.3rem 0.7rem', fontSize: '0.8rem', background: 'var(--card-bg)', border: '1px solid var(--border)', color: page > 1 ? 'var(--text-main)' : 'var(--text-muted)', opacity: page > 1 ? 1 : 0.5 }}>◀</button>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn" style={{ width: 'auto', padding: '0.3rem 0.7rem', fontSize: '0.8rem', background: 'var(--card-bg)', border: '1px solid var(--border)', color: page < totalPages ? 'var(--text-main)' : 'var(--text-muted)', opacity: page < totalPages ? 1 : 0.5 }}>▶</button>
          </div>
        )}
      </nav>

      <section aria-label="선택된 문제" style={{ flexGrow: 1 }}>
        {selectedProblem ? (
          <div className="problem-card" style={{ margin: 0 }}>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--color-4)' }}>{selectedProblem.title}</h3>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e6a800' }}>
                🏆 획득 레이팅: +{(selectedProblem.current_difficulty as number).toLocaleString()} RP
              </div>
              {(() => {
                const diff = selectedProblem.current_difficulty as number;
                if (diff <= 30000) return <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#00c853', padding: '0.2rem 0.6rem', borderRadius: '99px', background: 'rgba(0,200,83,0.12)', border: '1px solid rgba(0,200,83,0.3)' }}>⭐ 쉬움</span>;
                if (diff <= 70000) return <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffc107', padding: '0.2rem 0.6rem', borderRadius: '99px', background: 'rgba(255,193,7,0.12)', border: '1px solid rgba(255,193,7,0.3)' }}>⭐⭐ 보통</span>;
                if (diff <= 120000) return <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ff6d00', padding: '0.2rem 0.6rem', borderRadius: '99px', background: 'rgba(255,109,0,0.12)', border: '1px solid rgba(255,109,0,0.3)' }}>⭐⭐⭐ 어려움</span>;
                return <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d50000', padding: '0.2rem 0.6rem', borderRadius: '99px', background: 'rgba(213,0,0,0.12)', border: '1px solid rgba(213,0,0,0.3)' }}>⭐⭐⭐⭐ 매우어려움</span>;
              })()}
            </div>
            <div className="math-content" style={{ fontSize: '1.8rem' }}>{renderMath(selectedProblem.content)}</div>
            {lastCorrectFeedback && (
              <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', background: 'rgba(0, 200, 83, 0.08)', borderRadius: '0.5rem', border: '1px solid rgba(0, 200, 83, 0.25)' }}>
                <div style={{ fontWeight: 700, color: '#00c853', marginBottom: '0.3rem', fontSize: '1.05rem' }}>✅ 정답!</div>
                <div style={{ color: '#e6a800', fontWeight: 800, fontSize: '1.1rem' }}>+{lastCorrectFeedback.rpGained.toLocaleString()} RP</div>
              </div>
            )}
            {lastWrongAnswer && lastWrongAnswer.problemId === selectedProblem.id && (
              <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', background: 'rgba(255, 0, 0, 0.05)', borderRadius: '0.5rem', border: '1px solid rgba(255, 0, 0, 0.2)' }}>
                <div style={{ fontWeight: 700, color: '#d32f2f', marginBottom: '0.3rem' }}>틀렸습니다</div>
                <button onClick={() => setLastWrongAnswer(null)} style={{ background: 'none', border: 'none', color: 'var(--color-4)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', marginTop: '0.4rem', padding: 0 }}>닫기</button>
              </div>
            )}
            <div style={{ marginTop: '2rem' }}>
              <input type="text" placeholder="정답" className="answer-input" value={answers[selectedProblem.id] || ''} onChange={(e) => handleInputChange(selectedProblem.id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit(selectedProblem.id)} />
              <button onClick={() => handleSubmit(selectedProblem.id)} className="btn btn-solve">제출</button>
            </div>
          </div>
        ) : <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>문제를 선택해주세요.</div>}
      </section>

      {/* 생성 모달 */}
      {showGenerateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '1rem', boxSizing: 'border-box'
        }}>
          <div className="problem-card" style={{
            width: '100%', maxWidth: '450px', margin: 0, position: 'relative',
            background: 'var(--card-bg)'
          }}>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--color-4)' }}>문제 생성</h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button onClick={() => setTemplateMode(false)} className="btn" style={{ width: 'auto', padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: !templateMode ? 'var(--color-4)' : 'var(--card-bg)', color: !templateMode ? 'white' : 'var(--text-main)', border: '1px solid var(--border)', flex: 1 }}>태그 기반</button>
              <button onClick={() => setTemplateMode(true)} className="btn" style={{ width: 'auto', padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: templateMode ? 'var(--color-4)' : 'var(--card-bg)', color: templateMode ? 'white' : 'var(--text-main)', border: '1px solid var(--border)', flex: 1 }}>템플릿 기반</button>
            </div>

            {!templateMode ? (
              <>
                <p style={{ marginBottom: '1rem', opacity: 0.8, fontSize: '0.9rem' }}>생성할 문제 유형을 선택하세요.</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {allTags.map(tag => (
                    <label key={tag} style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0.5rem 0.8rem', borderRadius: '0.5rem',
                      background: selectedTags.includes(tag) ? 'var(--color-3)' : 'var(--card-bg)',
                      border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem'
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTags([...selectedTags, tag]);
                          } else {
                            setSelectedTags(selectedTags.filter(t => t !== tag));
                          }
                        }}
                        style={{ accentColor: 'var(--color-4)' }}
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p style={{ marginBottom: '1rem', opacity: 0.8, fontSize: '0.9rem' }}>템플릿을 선택하거나 단원/개념으로 필터링하세요.</p>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' }}>
                  <select value={selectedUnit} onChange={e => { setSelectedUnit(e.target.value); setSelectedConcept(''); }} style={{ flex: 1, padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontSize: '0.8rem' }}>
                    <option value="">전체 단원</option>
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <select value={selectedConcept} onChange={e => { setSelectedConcept(e.target.value); }} style={{ flex: 1, padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontSize: '0.8rem' }}>
                    <option value="">전체 개념</option>
                    {concepts.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {(() => {
                    const filteredTemplates = templates
                      .filter(t => !selectedUnit || t.unit === selectedUnit)
                      .filter(t => !selectedConcept || Array.isArray(t.concepts) && t.concepts.includes(selectedConcept));
                    const filteredIds = filteredTemplates.map(t => t.id);
                    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedTemplateIds.includes(id));
                    return (
                      <>
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: '0.4rem',
                          padding: '0.4rem 0.6rem', borderRadius: '0.4rem',
                          cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                          border: '1px dashed var(--border)', background: 'var(--card-bg)'
                        }}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => {
                              if (allSelected) {
                                setSelectedTemplateIds(prev => prev.filter(id => !filteredIds.includes(id)));
                              } else {
                                setSelectedTemplateIds(prev => [...new Set([...prev, ...filteredIds])]);
                              }
                            }}
                            style={{ accentColor: 'var(--color-4)' }}
                          />
                          <span>일괄 선택 ({filteredIds.length}개)</span>
                        </label>
                        {filteredTemplates.map(t => {
                          const isChecked = selectedTemplateIds.includes(t.id);
                          return (
                            <label key={t.id} style={{
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                              padding: '0.4rem 0.6rem', borderRadius: '0.4rem',
                              background: isChecked ? 'var(--color-3)' : 'transparent',
                              border: isChecked ? '1px solid var(--color-4)' : '1px solid var(--border)',
                              cursor: 'pointer', fontSize: '0.8rem'
                            }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedTemplateIds(prev =>
                                    prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                                  );
                                }}
                                style={{ accentColor: 'var(--color-4)' }}
                              />
                              <span><strong>{t.title}</strong> <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>({t.id})</span></span>
                            </label>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem', opacity: 0.75 }}>생성할 문제 수</label>
              <input
                type="number"
                min={1}
                max={50}
                value={generationCount}
                onChange={e => setGenerationCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowGenerateModal(false); setSelectedTags([]); setGenerationCount(5); setTemplateMode(false); setSelectedTemplateIds([]); setSelectedUnit(''); setSelectedConcept(''); }}
                className="btn" style={{ background: 'var(--text-muted)', color: 'white', width: 'auto' }}
              >
                취소
              </button>
              <button onClick={templateMode ? confirmGenerateTemplate : confirmGenerate} className="btn" style={{ background: 'var(--color-2)', color: 'white', width: 'auto' }}>
                {generationCount}개 생성
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

const Shop: React.FC<{ user: User | null; setUser: (u: User) => void }> = ({ user, setUser }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const token = localStorage.getItem('token');
    fetch('/api/store/items', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.items) setItems(data.items);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, navigate]);

  const handleBuy = async (itemId: string) => {
    if (!window.confirm('정말 구매하시겠습니까?')) return;
    const token = localStorage.getItem('token');
    let url = '';
    let cost = 0;
    if (itemId === 'streak_repair') {
      url = '/api/store/buy-streak-repair';
      cost = 30;
    } else if (itemId === 'firework_effect') {
      url = '/api/store/buy-firework-effect';
      cost = 100;
    } else if (itemId === 'developer_chango') {
      url = '/api/store/buy-developer-chango';
      cost = 500;
    } else if (itemId === 'fever_2x' || itemId === 'fever_5x') {
      url = '/api/store/buy-fever';
      cost = itemId === 'fever_2x' ? 100 : 500;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(itemId === 'fever_2x' || itemId === 'fever_5x' ? { body: JSON.stringify({ type: itemId }) } : {})
    });
    const data = await res.json();
    if (res.ok) {
      let msg = '';
      if (itemId === 'streak_repair') msg = '스트릭이 복구되었습니다.';
      else if (itemId === 'firework_effect') msg = '폭죽 이펙트가 활성화되었습니다.';
      else if (itemId === 'developer_chango') msg = '🎫 개발자의 칭호를 구매했습니다! 프로필에서 칭호를 입력하세요.';
      else if (itemId === 'fever_2x' || itemId === 'fever_5x') msg = data.message || '🔥 피버타임이 활성화되었습니다!';
      setMessage(`✅ 구매 완료! ${msg}`);
      const updatedUser = { ...user!, tokens: (user!.tokens || 0) - cost };
      if (itemId === 'streak_repair') {
        updatedUser.streak = 0;
        updatedUser.streak_repaired = true;
      } else if (itemId === 'firework_effect') {
        updatedUser.has_firework_effect = true;
      } else if (itemId === 'fever_2x' || itemId === 'fever_5x') {
        updatedUser.fever_multiplier = data.fever_multiplier;
        updatedUser.fever_expires_at = data.fever_expires_at;
      }
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } else {
      setMessage(`❌ ${data.error}`);
    }
  };

  return (
    <main className="container" style={{ padding: '4rem 0', maxWidth: '800px', margin: '0 auto' }}>
      <Helmet>
        <title>상점 | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://llogis.xyz${location.pathname}`} />
      </Helmet>
      <h2 style={{ color: 'var(--color-4)', fontSize: '2.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>🪙 토큰 상점</h2>
      <p style={{ textAlign: 'center', opacity: 0.7, marginBottom: '2.5rem' }}>보유 토큰: <b style={{ color: '#e6a800', fontSize: '1.2rem' }}>{user?.tokens || 0} 토큰</b></p>

      {message && (
        <div style={{ padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', marginBottom: '1.5rem', textAlign: 'center', fontWeight: 700 }}>
          {message}
        </div>
      )}

      {loading ? <p style={{ textAlign: 'center' }}>로딩 중...</p> : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {items.map(item => (
            <div key={item.id} className="problem-card" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.3rem', color: 'var(--color-4)' }}>{item.name}</h3>
                <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>{item.description}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem', color: '#e6a800' }}>🪙 {item.cost} 토큰</div>
                <button
                  onClick={() => handleBuy(item.id)}
                  disabled={(user?.tokens || 0) < item.cost}
                  className="btn"
                  style={{ width: 'auto', padding: '0.6rem 1.5rem', background: (user?.tokens || 0) >= item.cost ? 'var(--color-4)' : 'var(--border)', color: (user?.tokens || 0) >= item.cost ? 'white' : 'var(--text-muted)', cursor: (user?.tokens || 0) >= item.cost ? 'pointer' : 'not-allowed', opacity: (user?.tokens || 0) >= item.cost ? 1 : 0.6 }}
                >
                  구매하기
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
};

const Login: React.FC<{ onLogin: (token: string, user: User) => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      onLogin(data.token, data.user);
      navigate('/');
    } else alert(data.error);
  };

  return (
    <main className="container">
      <Helmet>
        <title>로그인 | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="description" content="Logis에 로그인하여 수학 문제를 풀고 레이팅을 올려보세요." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://llogis.xyz${location.pathname}`} />
      </Helmet>
      <section aria-label="로그인" className="auth-form">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src="/logo_new.png" alt="Logis 로고" loading="lazy" style={{ width: '80px', height: '80px', borderRadius: '1.5rem', boxShadow: 'var(--card-shadow)' }} />
        </div>
        <h2 style={{ color: 'var(--color-4)' }}>로그인</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="아이디/이메일" value={email} onChange={e => setEmail(e.target.value)} required aria-label="아이디 또는 이메일" />
          <input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} required aria-label="비밀번호" />
          <button type="submit" aria-label="로그인 제출">로그인</button>
        </form>
      </section>
    </main>
  );
};

const Signup: React.FC<{ onLogin: (token: string, user: User) => void }> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    if (res.ok) {
      const data = await res.json();
      onLogin(data.token, data.user);
      navigate('/');
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  return (
    <main className="container">
      <Helmet>
        <title>회원가입 | Logis - 수학 문제 풀이 플랫폼</title>
        <meta name="description" content="Logis에 가입하여 수학 문제 풀이를 시작하고 레이팅을 올려보세요." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://llogis.xyz${location.pathname}`} />
      </Helmet>
      <section aria-label="회원가입" className="auth-form">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src="/logo_new.png" alt="Logis 로고" loading="lazy" style={{ width: '80px', height: '80px', borderRadius: '1.5rem', boxShadow: 'var(--card-shadow)' }} />
        </div>
        <h2 style={{ color: 'var(--color-4)' }}>가입하기</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="이름" value={username} onChange={e => setUsername(e.target.value)} required aria-label="사용자 이름" />
          <input type="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} required aria-label="이메일 주소" />
          <input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} required aria-label="비밀번호" />
          <button type="submit" aria-label="회원가입 제출">가입</button>
        </form>
      </section>
    </main>
  );
};

const AppContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [themeToggleCount, setThemeToggleCount] = useState(() => Number(localStorage.getItem('theme-toggle-count') || '0'));
  const [logoClickCount, setLogoClickCount] = useState(() => Number(localStorage.getItem('logo-click-count') || '0'));
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) setUser(JSON.parse(savedUser));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    const nextCount = themeToggleCount + 1;

    setTheme(newTheme);
    setThemeToggleCount(nextCount >= 20 ? 0 : nextCount);
    localStorage.setItem('theme', newTheme);
    localStorage.setItem('theme-toggle-count', String(nextCount >= 20 ? 0 : nextCount));

    // 다크모드 활성화 시 즉시 '어둠의 Logis' 칭호 체크
    if (newTheme === 'dark') {
      const token = localStorage.getItem('token');
      if (token) {
        fetch('/api/titles/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'dark_mode', value: 1 })
        }).then(r => r.json()).then(data => {
          if (data.newlyUnlocked && data.newlyUnlocked.length > 0) {
            setTimeout(() => alert(`🎉 새 칭호 획득: ${data.newlyUnlocked.map((t: any) => t.name).join(', ')}`), 500);
          }
        }).catch(() => {});
      }
    }

    if (nextCount >= 20) {
      navigate('/goose-room');
    }
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    const nextCount = logoClickCount + 1;
    setLogoClickCount(nextCount >= 20 ? 0 : nextCount);
    localStorage.setItem('logo-click-count', String(nextCount >= 20 ? 0 : nextCount));
    if (nextCount >= 20) {
      e.preventDefault();
      navigate('/cat-room');
    }
  };

  const handleLogin = (token: string, nextUser: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
    fetch('/api/titles/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'login' })
    }).then(r => r.json()).then(data => {
      if (data.newlyUnlocked && data.newlyUnlocked.length > 0) {
        setTimeout(() => alert(`🎉 새 칭호 획득: ${data.newlyUnlocked.map((t: any) => t.name).join(', ')}`), 500);
      }
    }).catch(() => {});
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <>
      <a href="#main-content" className="skip-link" style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: 9999, padding: '1rem', background: '#5c95ff', color: 'white' }} onFocus={e => e.currentTarget.style.left = '0'} onBlur={e => e.currentTarget.style.left = '-9999px'}>본문으로 바로가기</a>
      <Navbar user={user} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} onLogoClick={handleLogoClick} />
      {user?.fever_expires_at && new Date(user.fever_expires_at) > new Date() && (
        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'linear-gradient(90deg, #ff6b6b22, #ff6b6b44, #ff6b6b22)', borderBottom: '1px solid #ff6b6b', fontWeight: 800, color: '#ff6b6b', fontSize: '1rem' }}>
          🔥 {user.fever_multiplier}배 피버타임 활성중! — <FeverTimer expiresAt={user.fever_expires_at} />
        </div>
      )}
      <div id="main-content" role="main">
        <Routes>
          <Route path="/" element={<Landing user={user} />} />
          <Route path="/solve" element={<ProblemList user={user} setUser={setUser} />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/users/:id" element={<UserProfile />} />
          <Route path="/groups" element={<Groups user={user} />} />
          <Route path="/groups/:id" element={<GroupDetail user={user} />} />
          <Route path="/about" element={<About user={user} />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/signup" element={<Signup onLogin={handleLogin} />} />
          <Route path="/profile" element={<Profile user={user} setUser={setUser} />} />
          <Route path="/shop" element={<Shop user={user} setUser={setUser} />} />
          <Route path="/admin" element={<Admin user={user} />} />
          <Route path="/bug-report" element={<BugReport user={user} />} />
          <Route path="/goose-room" element={<GooseRoom />} />
          <Route path="/cat-room" element={<CatRoom />} />
        </Routes>
      </div>
      <footer role="contentinfo" style={{ textAlign: 'center', padding: '2rem 1rem', fontSize: '0.85rem', opacity: 0.6, borderTop: '1px solid var(--border)', marginTop: '2rem' }}>
        <p>&copy; {new Date().getFullYear()} Logis. All rights reserved. | <Link to="/about" style={{ color: 'var(--color-4)', textDecoration: 'none' }}>소개</Link> | <Link to="/ranking" style={{ color: 'var(--color-4)', textDecoration: 'none' }}>랭킹</Link></p>
      </footer>
    </>
  );
};

const FeverTimer: React.FC<{ expiresAt: string }> = ({ expiresAt }) => {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('종료'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}분 ${s}초`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return <span>{remaining}</span>;
};

const App: React.FC = () => (
  <Router>
    <AppContent />
  </Router>
);

export default App;
