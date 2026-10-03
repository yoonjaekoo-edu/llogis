import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const NO_PREF = '(prefers-reduced-motion: no-preference)';
const REDUCE = '(prefers-reduced-motion: reduce)';

// 화면에 이미 들어와 있는 요소는 스크롤을 기다리지 않고 바로 등장시킨다.
const isNearViewport = (el: Element, ratio = 0.9) =>
  el.getBoundingClientRect().top <= window.innerHeight * ratio;

type RevealProps = {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * 스크롤 등장 래퍼. 첫 페인트 전에 GSAP으로 숨겨 두고 뷰포트에 들어오면 한 번만 나타난다.
 * CSS에는 초기 상태를 넣지 않으므로 스크립트가 실패해도 콘텐츠는 그대로 보인다.
 */
export const Reveal: React.FC<RevealProps> = ({ children, delay = 0, y = 26, className, style }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    mm.add(NO_PREF, () => {
      const show = () =>
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.75,
          ease: 'power3.out',
          delay,
          clearProps: 'opacity,transform',
        });

      gsap.set(el, { opacity: 0, y });
      if (isNearViewport(el)) {
        show();
        return;
      }
      const trigger = ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: show });
      return () => trigger.kill();
    });

    return () => mm.revert();
  }, [delay, y]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
};

type CountUpProps = {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

/** 숫자 카운트업. 뷰포트에 들어오면 0에서 목표값까지 올라간다. */
export const CountUp: React.FC<CountUpProps> = ({
  value,
  duration = 1.4,
  prefix = '',
  suffix = '',
  className,
}) => {
  const ref = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const write = (v: number) => {
      el.textContent = `${prefix}${Math.round(v).toLocaleString()}${suffix}`;
    };

    const mm = gsap.matchMedia();
    mm.add(NO_PREF, () => {
      const counter = { v: 0 };
      const run = () =>
        gsap.to(counter, {
          v: value,
          duration,
          ease: 'power2.out',
          snap: { v: 1 },
          onUpdate: () => write(counter.v),
        });

      write(0);
      if (isNearViewport(el, 0.95)) {
        run();
        return;
      }
      const trigger = ScrollTrigger.create({ trigger: el, start: 'top 95%', once: true, onEnter: run });
      return () => trigger.kill();
    });
    mm.add(REDUCE, () => write(value));

    return () => mm.revert();
  }, [value, duration, prefix, suffix]);

  return <span ref={ref} className={className} aria-label={String(value)} />;
};

/**
 * 랜딩 페이지 전체 모션. 히어로 인트로 타임라인, 스크롤 패럴랙스, 티어 마퀴를
 * 하나의 matchMedia 컨텍스트에서 관리하므로 언마운트 시 흔적 없이 되돌아간다.
 */
export function useLandingMotion(rootRef: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const q = gsap.utils.selector(root);
    const hero = root.querySelector('.landing-hero');
    const mm = gsap.matchMedia();

    mm.add(NO_PREF, () => {
      const eyebrow = q('.landing-hero-eyebrow');
      const dot = q('.landing-hero-eyebrow span');
      const lines = q('.lh-line-inner');
      const sub = q('.landing-hero-sub');
      const hint = q('.landing-hero-hint');
      const cta = q('.landing-hero-cta-group .btn-hero');
      const rule = q('.landing-hero-trust-rule');
      const trustItems = q('.landing-hero-trust > span:not(.landing-hero-trust-rule)');

      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => ScrollTrigger.refresh(),
      });

      if (eyebrow.length) tl.from(eyebrow, { y: 14, opacity: 0, duration: 0.55 });
      if (dot.length) tl.from(dot, { scale: 0, duration: 0.5, ease: 'back.out(2.2)' }, '-=0.3');
      if (lines.length) tl.from(lines, { yPercent: 118, duration: 1, stagger: 0.12, ease: 'power4.out' }, '-=0.32');
      if (sub.length) tl.from(sub, { y: 16, opacity: 0, duration: 0.7 }, '-=0.62');
      if (hint.length) tl.from(hint, { y: 14, opacity: 0, duration: 0.5 }, '-=0.5');
      if (cta.length) tl.from(cta, { y: 16, opacity: 0, duration: 0.6, stagger: 0.08 }, '-=0.45');
      if (rule.length) tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, '-=0.35');
      if (trustItems.length) tl.from(trustItems, { y: 10, opacity: 0, duration: 0.5, stagger: 0.07 }, '-=0.5');

      // eyebrow 옆 점: 인트로가 끝난 뒤 은은하게 맥동
      const dotPulse = dot.length
        ? gsap.to(dot, {
            scale: 2,
            opacity: 0.3,
            duration: 1.2,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: 1.6,
          })
        : null;

      // 티어 마퀴: 트랙이 두 벌이라 절반만큼 밀면 이음매 없이 반복된다
      const track = q('.landing-tier-track');
      const marquee = track.length
        ? gsap.to(track, { xPercent: -50, duration: 48, ease: 'none', repeat: -1 })
        : null;

      return () => {
        tl.kill();
        dotPulse?.kill();
        marquee?.kill();
      };
    });

    // 넓은 화면에서만 스크롤 패럴랙스 (히어로는 화면 밖으로 나가며 옅어진다)
    mm.add(`(min-width: 769px) and ${NO_PREF}`, () => {
      if (!hero) return;
      const content = q('.landing-hero-content');
      const grid = q('.landing-hero-grid');
      const tweens: gsap.core.Tween[] = [];

      const scrollTrigger = { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.35 } as const;

      if (content.length) {
        tweens.push(gsap.to(content, { yPercent: -9, autoAlpha: 0.3, ease: 'none', scrollTrigger }));
      }
      if (grid.length) {
        tweens.push(gsap.to(grid, { y: 64, ease: 'none', scrollTrigger: { ...scrollTrigger, scrub: true } }));
      }

      return () => tweens.forEach(tween => tween.kill());
    });

    // 웹폰트가 늦게 도착하면 트리거 위치가 어긋난다
    document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => {});

    return () => mm.revert();
  }, [rootRef]);
}
