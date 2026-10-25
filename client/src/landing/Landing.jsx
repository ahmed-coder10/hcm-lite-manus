import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Button, cn } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import Hero from './Hero';
import { AiShowcase, Faq, FinalCta, Flow, Footer, Marquee, Metrics, Modules } from './Sections';

const NAV_LINKS = [
  ['Modules', '#modules'],
  ['How it works', '#how'],
  ['FAQ', '#faq'],
];

/** Thin gradient bar showing read progress. */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 22, restDelta: 0.001 });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-violet via-cyan to-mint"
      aria-hidden="true"
    />
  );
}

/** Soft light that follows the cursor on pointer devices. */
function CursorGlow() {
  const reduced = useReducedMotion();
  const [pos, setPos] = useState({ x: -400, y: -400 });

  useEffect(() => {
    if (reduced) return undefined;
    const move = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 hidden lg:block"
      style={{
        background: `radial-gradient(360px circle at ${pos.x}px ${pos.y}px, rgba(124,92,255,0.09), transparent 65%)`,
        transition: 'background 120ms linear',
      }}
    />
  );
}

function Nav({ needsSetup }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-all duration-300', scrolled ? 'py-2' : 'py-4')}>
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <nav
          aria-label="Main"
          className={cn(
            'flex items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-300',
            scrolled ? 'glass-strong shadow-card' : 'border border-transparent',
          )}
        >
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-display text-sm font-bold text-ink-950">
              H
              <span className="absolute inset-0 rounded-lg bg-violet/50 opacity-0 blur-md transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight">HCM Lite</span>
            <span className="hidden rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-faint sm:inline">
              hackathon
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="rounded-lg px-3 py-2 text-[13px] text-text-muted transition hover:bg-white/[0.05] hover:text-text"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button as={Link} to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
              {needsSetup ? 'Setup' : 'Sign in'}
            </Button>
            <Button as={Link} to={needsSetup ? '/setup' : '/login'} size="sm" variant="light" icon={ArrowRight}>
              {needsSetup ? 'Set up' : 'Open demo'}
            </Button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className="grid h-9 w-9 place-items-center rounded-lg text-text-muted transition hover:bg-white/5 md:hidden"
            >
              {open ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </nav>

        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 rounded-2xl glass-strong p-3 md:hidden"
          >
            {[...NAV_LINKS, ['Sign in', '/login']].map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-text-muted transition hover:bg-white/5 hover:text-text"
              >
                {label}
              </a>
            ))}
          </motion.div>
        ) : null}
      </div>
    </header>
  );
}

export default function Landing() {
  const { setup } = useAuth();
  const needsSetup = setup?.needsSetup !== false;

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-ink-950">
      <ScrollProgress />
      <CursorGlow />
      <div className="noise pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
      <Nav needsSetup={needsSetup} />
      <main className="relative z-10">
        <Hero needsSetup={needsSetup} />
        <Marquee />
        <Modules />
        <Flow />
        <AiShowcase />
        <Metrics />
        <Faq />
        <FinalCta needsSetup={needsSetup} />
      </main>
      <Footer />
    </div>
  );
}
