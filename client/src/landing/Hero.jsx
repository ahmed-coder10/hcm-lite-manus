import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight, CalendarCheck, CircleDollarSign, Fingerprint, LayoutDashboard, Sparkles, Users, Zap,
} from 'lucide-react';
import { Button } from '../components/ui';

const float = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.2, 0.7, 0.3, 1] },
});

export default function Hero({ needsSetup }) {
  const [Scene, setScene] = useState(null);
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.15]);

  // The WebGL bundle is only fetched on the client, never blocking first paint.
  useEffect(() => {
    if (reduced) return;
    let alive = true;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 400));
    idle(() => {
      import('./Scene.jsx').then((mod) => {
        if (alive) setScene(() => mod.default);
      });
    });
    return () => {
      alive = false;
    };
  }, [reduced]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden pb-24 pt-32 sm:pb-32 sm:pt-40">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-aurora-radial" />
        <div className="aurora animate-floaty" style={{ animationDuration: '14s' }} />
        <div className="absolute inset-0 grid-bg opacity-70" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink-950" />
      </div>

      <motion.div style={{ y, opacity }} className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:px-8">
        <div className="relative z-10">
          <motion.div {...float(0.05)} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulseRing rounded-full bg-mint" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint" />
            </span>
            <span className="font-mono text-2xs uppercase tracking-[0.16em] text-text-muted">
              Saylani Hackathon · 24 Oct 2026 · Zaitoon Ashraf IT Park
            </span>
          </motion.div>

          <motion.h1 {...float(0.12)} className="font-display text-[clamp(2.4rem,6.2vw,4.4rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
            Human capital,
            <br />
            <span className="gradient-text">answered.</span>
          </motion.h1>

          <motion.p {...float(0.2)} className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-text-muted">
            HCM Lite is the HR system a small team actually needs: attendance, leave and payroll in one live
            source of truth — with an AI assistant that answers from <em className="not-italic text-text">your</em> data,
            not from a prompt.
          </motion.p>

          <motion.div {...float(0.28)} className="mt-8 flex flex-wrap items-center gap-3">
            <Button as={Link} to={needsSetup ? '/setup' : '/login'} size="lg" variant="light" icon={Zap} className="group">
              {needsSetup ? 'Start first-run setup' : 'Open the live demo'}
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Button>
            <Button as="a" href="#modules" size="lg" variant="secondary" icon={LayoutDashboard}>
              See the 9 modules
            </Button>
          </motion.div>

          <motion.dl {...float(0.36)} className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/[0.07] pt-6">
            {[
              ['3', 'roles, one login'],
              ['25', 'shipped features'],
              ['9', 'modules'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="font-display text-2xl font-semibold text-text">{value}</dt>
                <dd className="mt-0.5 text-[12.5px] leading-tight text-text-faint">{label}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* 3D stage with floating glass cards */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.2, 0.7, 0.3, 1] }}
          className="relative mx-auto h-[340px] w-full max-w-[520px] sm:h-[440px] lg:h-[540px]"
        >
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(91,62,232,0.28),transparent_62%)] blur-2xl" />

          {Scene ? (
            <Scene className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <div className="relative h-44 w-44 rounded-full bg-gradient-to-br from-violet/70 via-violet-deep to-cyan/40 blur-[2px] shadow-glow" />
            </div>
          )}

          <motion.div
            {...float(0.5)}
            className="absolute left-0 top-8 w-[190px] rounded-xl glass-strong p-3 shadow-card sm:left-2 sm:w-[210px]"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-mint/15 p-1 text-mint"><CalendarCheck size={13} /></span>
              <p className="text-[11.5px] font-medium text-text-muted">Attendance today</p>
            </div>
            <p className="mt-1.5 font-display text-xl font-semibold">94<span className="text-sm text-text-faint">%</span></p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <motion.div initial={{ width: 0 }} animate={{ width: '94%' }} transition={{ duration: 1.4, delay: 0.9 }} className="h-full rounded-full bg-gradient-to-r from-mint to-cyan" />
            </div>
          </motion.div>

          <motion.div
            {...float(0.62)}
            className="absolute bottom-12 right-0 w-[186px] rounded-xl glass-strong p-3 shadow-card sm:right-2"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-violet/15 p-1 text-violet-soft"><Users size={13} /></span>
              <p className="text-[11.5px] font-medium text-text-muted">On leave today</p>
            </div>
            <p className="mt-1.5 font-display text-xl font-semibold">5</p>
            <p className="text-[11px] text-text-faint">3 casual · 2 sick</p>
          </motion.div>

          <motion.div
            {...float(0.74)}
            className="absolute bottom-0 left-2 flex items-center gap-2 rounded-full glass-strong px-3 py-1.5 shadow-card"
          >
            <Sparkles size={12} className="text-cyan-soft" aria-hidden="true" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">AI · tool calling</span>
          </motion.div>

          <motion.div
            {...float(0.86)}
            className="absolute right-6 top-0 hidden items-center gap-2 rounded-full glass-strong px-3 py-1.5 shadow-card sm:flex"
          >
            <CircleDollarSign size={12} className="text-amber" aria-hidden="true" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">Payroll locked</span>
          </motion.div>

          <p className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
            drag to rotate · move your cursor
          </p>
        </motion.div>
      </motion.div>

      {/* Trust strip */}
      <div className="mx-auto mt-16 max-w-6xl px-5 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-4 text-[11.5px] text-text-faint">
          <span className="inline-flex items-center gap-1.5"><Fingerprint size={13} /> JWT + bcrypt</span>
          <span className="hidden text-white/10 sm:inline">|</span>
          <span>Server-side role &amp; data-scope checks</span>
          <span className="hidden text-white/10 sm:inline">|</span>
          <span>Audit log on every action</span>
          <span className="hidden text-white/10 sm:inline">|</span>
          <span>AI key never reaches the browser</span>
        </div>
      </div>
    </section>
  );
}
