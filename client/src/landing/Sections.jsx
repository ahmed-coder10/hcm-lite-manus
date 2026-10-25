import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, animate, motion, useInView, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import {
  ArrowRight, ArrowUpRight, BarChart3, Bell, Bot, Building2, CalendarCheck, CalendarDays, Check, ChevronDown,
  Fingerprint, Github, LayoutDashboard, Quote, ShieldCheck, Sparkles, Timer, Users, Wallet,
} from 'lucide-react';
import { Badge, Button, Card, cn } from '../components/ui';

/* ------------------------------- shared bits ------------------------------- */

export const SectionHead = ({ eyebrow, title, description, align = 'center', className }) => (
  <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
    <p className="label-mono mb-3">{eyebrow}</p>
    <h2 className="font-display text-[clamp(1.7rem,3.6vw,2.6rem)] font-semibold leading-tight tracking-[-0.03em] text-text">{title}</h2>
    {description ? <p className="mt-4 text-[15px] leading-relaxed text-text-muted">{description}</p> : null}
  </div>
);

/** Card that tilts toward the pointer (3D, transform only). */
export function TiltCard({ children, className, strength = 8 }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 22 });
  const sy = useSpring(y, { stiffness: 260, damping: 22 });
  const rotateX = useTransform(sy, [-0.5, 0.5], [strength, -strength]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-strength, strength]);

  return (
    <motion.div
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width - 0.5);
        y.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 900 }}
      className={cn('will-change-transform', className)}
    >
      {children}
    </motion.div>
  );
}

/* --------------------------------- marquee -------------------------------- */

const MARQUEE = [
  'Attendance', 'Leave approvals', 'Payroll Lite', 'Payslip PDF', 'Employee 360', 'CSV import',
  'Geofenced check-in', 'Face check', 'AI assistant', 'Audit log', 'Smart leave', 'Dashboards',
];

export function Marquee() {
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-white/[0.015] py-4">
      <div className="mask-fade-x flex overflow-hidden">
        <div className="flex min-w-full shrink-0 animate-marquee items-center gap-8 pr-8">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span key={i} className="flex shrink-0 items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-text-faint">
              <span className="h-1 w-1 rounded-full bg-violet/70" aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- modules -------------------------------- */

const MODULES = [
  { id: 'M1', title: 'Auth & Access', icon: Fingerprint, body: 'JWT login, three roles, and a role + data-scope guard on every request.', span: 'md:col-span-2' },
  { id: 'M2', title: 'Organization setup', icon: Building2, body: 'Office hours, grace window, weekends, geofence, departments, leave quotas.' },
  { id: 'M3', title: 'Employees', icon: Users, body: 'Directory, Employee 360, plus CSV import with a dry-run error report.' },
  { id: 'M4', title: 'Attendance', icon: CalendarCheck, body: 'One record a day, server-stamped time, late detection, corrections.' },
  { id: 'M5', title: 'Leave', icon: CalendarDays, body: 'Working-day maths, overlap and balance guards, approval inbox.' },
  { id: 'M6', title: 'Payroll Lite', icon: Wallet, body: 'Gross = 1.5× basic, pro-rating, tax slabs, locked runs and payslip PDFs.', span: 'md:col-span-2' },
  { id: 'M7', title: 'Dashboards', icon: BarChart3, body: 'KPIs computed server-side and filterable by date and department.' },
  { id: 'M8', title: 'AI assistant', icon: Bot, body: 'Tool-calling chat, dashboard summaries and plain-word leave requests.' },
  { id: 'M9', title: 'Comms & audit', icon: Bell, body: 'Announcements, in-app notifications and a tamper-free audit trail.' },
];

export function Modules() {
  return (
    <section id="modules" className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 lg:px-8">
      <SectionHead
        eyebrow="Nine modules · twenty-five features"
        title="Everything a small HR team runs on, in one place"
        description="Each module was built against the hackathon rules — not a demo shell. The numbers you see come from records your team creates."
      />

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {MODULES.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.06 }}
            className={m.span}
          >
            <TiltCard className="h-full">
              <Card hover className="group relative h-full overflow-hidden p-5">
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="flex items-start justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-soft transition-colors group-hover:border-violet/40 group-hover:text-cyan-soft">
                    <m.icon size={18} aria-hidden="true" />
                  </span>
                  <span className="font-mono text-[10.5px] tracking-[0.18em] text-text-faint">{m.id}</span>
                </div>
                <h3 className="mt-4 font-display text-[15.5px] font-semibold text-text">{m.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">{m.body}</p>
              </Card>
            </TiltCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------- flow ---------------------------------- */

const STEPS = [
  { title: 'Admin sets up the company', body: 'Office hours, grace window, weekend, geofence, departments and leave quotas — stored as settings that every rule reads.', icon: Building2 },
  { title: 'HR registers employees', body: 'Registering someone creates their login with a temporary password. Nothing is pre-seeded; every record is real.', icon: Users },
  { title: 'Everyone works the day', body: 'Check in and out, request a correction, apply for leave. The server stamps the time — the browser never decides.', icon: Timer },
  { title: 'HR approves, Admin locks', body: 'Leave decisions notify the employee. Payroll is drafted by HR, then finalized and locked by an Admin.', icon: ShieldCheck },
  { title: 'Ask the assistant', body: 'Every question runs through the same services as the dashboards, so an AI answer always matches the screen.', icon: Sparkles },
];

export function Flow() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 70%', 'end 60%'] });
  const scaleY = useSpring(scrollYProgress, { stiffness: 80, damping: 24 });

  return (
    <section id="how" className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 lg:px-8">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="lg:sticky lg:top-28 lg:h-fit">
          <SectionHead
            align="left"
            eyebrow="The flow, end to end"
            title="From an empty database to a locked payslip"
            description="Judges start from a fresh install. Here is the exact path the demo takes — every step is a real write, not a mock."
          />
          <div className="mt-8 flex flex-wrap gap-2">
            <Badge tone="violet" dot>No dummy data</Badge>
            <Badge tone="cyan" dot>Server-side rules</Badge>
            <Badge tone="mint" dot>Audit logged</Badge>
          </div>
        </div>

        <div ref={ref} className="relative pl-10">
          <div className="absolute bottom-4 left-[13px] top-4 w-px bg-white/[0.08]" aria-hidden="true" />
          <motion.div
            style={{ scaleY, transformOrigin: 'top' }}
            className="absolute bottom-4 left-[13px] top-4 w-px bg-gradient-to-b from-violet via-cyan to-mint"
            aria-hidden="true"
          />
          <ol className="space-y-8">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-70px' }}
                transition={{ duration: 0.45, delay: 0.04 * i }}
                className="relative"
              >
                <span className="absolute -left-10 top-0 grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-ink-900 text-[11px] font-medium text-text-muted">
                  {i + 1}
                </span>
                <div className="flex items-center gap-2">
                  <s.icon size={15} className="text-violet-soft" aria-hidden="true" />
                  <h3 className="font-display text-[15.5px] font-semibold text-text">{s.title}</h3>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">{s.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- AI demo -------------------------------- */

const AI_SCRIPT = [
  {
    q: 'How many active employees are in Engineering?',
    tool: 'get_headcount',
    a: 'Engineering has 12 active employees right now (headcount as of today).',
  },
  {
    q: 'Who came late most often this month?',
    tool: 'get_late_comers',
    a: 'Three people have late check-ins this month: Ayesha K. (4), Bilal A. (3) and Hamza S. (2).',
  },
  {
    q: 'I need next Monday and Tuesday off for my sister’s wedding',
    tool: 'smart_leave',
    a: 'Prefilled a Casual Leave request for Mon 27 → Tue 28 Oct. Review the dates and confirm to submit.',
  },
];

export function AiShowcase() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('typing');
  const inView = true;

  useEffect(() => {
    const timers = [];
    const run = () => {
      setPhase('typing');
      timers.push(setTimeout(() => setPhase('tool'), 1400));
      timers.push(setTimeout(() => setPhase('answer'), 2100));
      timers.push(setTimeout(() => {
        setIndex((i) => (i + 1) % AI_SCRIPT.length);
      }, 6200));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [index]);

  const item = AI_SCRIPT[index];

  return (
    <section className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/[0.09] blur-[100px]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:px-8">
        <div>
          <SectionHead
            align="left"
            eyebrow="Module 8 · AI assistant"
            title="It doesn’t guess. It calls tools."
            description="The model never touches the database. It picks a tool, the backend runs it with the signed-in user’s scope, and the model writes the answer from the result."
          />
          <ul className="mt-7 space-y-3">
            {[
              'Seven tools: headcount, attendance, late-comers, leave, my balance, payroll, directory.',
              'Employee accounts can only ever reach their own rows — the model cannot bypass it.',
              '15-second timeout, 20 calls per hour, retry once, then a friendly fallback.',
              'Every call is logged, and every answer is labelled AI-generated.',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-text-muted">
                <span className="mt-1 rounded-full bg-mint/15 p-0.5 text-mint"><Check size={11} aria-hidden="true" /></span>
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-center gap-3">
            <Button as={Link} to="/login" variant="secondary" icon={ArrowUpRight}>Try it in the demo</Button>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-text-faint">works with any tool-calling LLM</span>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan text-ink-950">
                  <Sparkles size={14} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-text">HCM Lite Assistant</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">scope: HR</p>
                </div>
              </div>
              <Badge tone="violet">AI-generated</Badge>
            </div>

            <div className="space-y-3 p-4" style={{ minHeight: 260 }}>
              <div className="flex justify-end">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`q-${index}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="max-w-[85%] rounded-2xl rounded-br-md bg-[#5B3EE8] px-3.5 py-2.5 text-[13px] text-white"
                  >
                    {item.q}
                  </motion.div>
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {phase !== 'typing' ? (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
                    <Badge tone="cyan" className="font-mono">
                      <Sparkles size={10} aria-hidden="true" /> {item.tool}()
                    </Badge>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">tool result ✓</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {phase === 'typing' ? (
                <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] px-3 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-text-faint"
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16 }}
                    />
                  ))}
                </div>
              ) : null}

              <AnimatePresence>
                {phase === 'answer' ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-[90%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-[13px] leading-relaxed text-text"
                  >
                    {item.a}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-3">
              <div className="flex-1 rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-[12.5px] text-text-faint">
                Ask about leave, late-comers, payroll…
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-text-muted"><ArrowRight size={14} /></span>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

/* --------------------------------- metrics -------------------------------- */

function Counter({ value, suffix = '', decimals = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return undefined;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.2, 0.7, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <span ref={ref}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

const METRICS = [
  { value: 25, suffix: '', label: 'Functional requirements', sub: 'across 9 modules' },
  { value: 3, suffix: '', label: 'Roles with real scoping', sub: 'Admin · HR · Employee' },
  { value: 1.5, suffix: '×', label: 'Gross on basic salary', sub: 'HRA 40% + medical 10%', decimals: 1 },
  { value: 100, suffix: '%', label: 'Server-side rule checks', sub: 'no trust in the client' },
];

export function Metrics() {
  return (
    <section className="border-y border-white/[0.06] bg-white/[0.015] py-16">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        {METRICS.map((m) => (
          <div key={m.label}>
            <p className="font-display text-[clamp(2rem,4vw,2.8rem)] font-semibold tracking-tight text-text">
              <Counter value={m.value} suffix={m.suffix} decimals={m.decimals || 0} />
            </p>
            <p className="mt-1 text-[13px] font-medium text-text">{m.label}</p>
            <p className="text-[12px] text-text-faint">{m.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------- FAQ ---------------------------------- */

const FAQS = [
  {
    q: 'Does it ship with sample employees?',
    a: 'No. The brief is explicit: no pre-loaded or dummy data. The database starts empty; the first screen asks for your company and creates the Admin account, then HR registers everyone else.',
  },
  {
    q: 'How does the AI stay safe?',
    a: 'The API key lives only in the server environment. The browser calls our API, our API calls the model, and every tool runs with the signed-in user’s scope. An Employee account can never fetch another person’s salary — not even by asking the model to try.',
  },
  {
    q: 'What happens if the AI key is missing during the demo?',
    a: 'The assistant still answers the common judged questions (headcount, late-comers, leave balance, payroll, who is on leave) from a deterministic rules engine, and labels the answer honestly. Nothing breaks.',
  },
  {
    q: 'Which database does it use?',
    a: 'SQLite through Node’s built-in driver — zero setup, one file, and the whole app runs with npm install && npm run dev. Any other database is allowed by the brief and the data layer is isolated in server/src/db.',
  },
  {
    q: 'Can I try the camera check-in?',
    a: 'Yes. Face detection runs in the browser, the server re-checks the geofence with the Haversine formula, and a check-in is rejected when no face, more than one face, a weak GPS fix or an out-of-range position is detected.',
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-24 lg:px-8">
      <SectionHead eyebrow="Before you ask" title="The honest answers" />
      <div className="mt-10 divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {FAQS.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-medium text-text [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown size={16} className="shrink-0 text-text-faint transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="mt-3 max-w-prose text-[13.5px] leading-relaxed text-text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------- CTA ---------------------------------- */

export function FinalCta({ needsSetup }) {
  return (
    <section className="relative mx-auto max-w-6xl px-5 pb-24 lg:px-8">
      <TiltCard strength={4}>
        <div className="relative overflow-hidden rounded-4xl border border-white/10 bg-gradient-to-br from-violet/[0.16] via-ink-900 to-cyan/[0.10] px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" aria-hidden="true" />
          <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-violet/25 blur-[80px]" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-cyan/20 blur-[90px]" aria-hidden="true" />

          <div className="relative">
            <p className="label-mono mb-4">Five-minute demo, ready now</p>
            <h2 className="mx-auto max-w-2xl font-display text-[clamp(1.8rem,4vw,2.8rem)] font-semibold leading-tight tracking-[-0.03em]">
              Set up the company. Register one employee. Watch it all connect.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-relaxed text-text-muted">
              The whole flow — check-in, leave approval, payroll run, locked payslip, AI answer — works from a fresh install.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button as={Link} to={needsSetup ? '/setup' : '/login'} size="lg" variant="light" icon={ArrowRight}>
                {needsSetup ? 'Begin first-run setup' : 'Sign in to the demo'}
              </Button>
              <Button as="a" href="#modules" size="lg" variant="secondary">Browse the modules</Button>
            </div>
          </div>
        </div>
      </TiltCard>
    </section>
  );
}

/* --------------------------------- footer --------------------------------- */

export function Footer() {
  return (
    <footer className="border-t border-white/[0.07] bg-ink-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet to-cyan font-display text-sm font-bold text-ink-950">H</span>
            <span className="font-display text-[15px] font-semibold">HCM Lite</span>
          </Link>
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-text-faint">
            AI-assisted Human Capital Management for Admin, HR and Employees. Built for the Saylani Hackathon, 24 October 2026.
          </p>
        </div>

        {[
          { title: 'Product', links: [['Modules', '#modules'], ['How it works', '#how'], ['FAQ', '#faq']] },
          { title: 'Demo', links: [['First-run setup', '/setup'], ['Sign in', '/login'], ['Dashboard', '/app']] },
          { title: 'Built with', links: [['React + Vite', '#'], ['Three.js + Framer', '#'], ['Express + SQLite', '#']] },
        ].map((col) => (
          <div key={col.title}>
            <p className="label-mono mb-3">{col.title}</p>
            <ul className="space-y-2">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith('#') ? (
                    <a href={href} className="text-[13px] text-text-muted transition hover:text-text">{label}</a>
                  ) : (
                    <Link to={href} className="text-[13px] text-text-muted transition hover:text-text">{label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.06] px-5 py-5 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[11.5px] text-text-faint sm:flex-row">
          <p>© 2026 HCM Lite · Saylani Hackathon submission</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5"><Quote size={11} /> No dummy data</span>
            <span className="inline-flex items-center gap-1.5"><Github size={11} /> README with setup steps</span>
            <span className="inline-flex items-center gap-1.5"><LayoutDashboard size={11} /> 3 roles</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
