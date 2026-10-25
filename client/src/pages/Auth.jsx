import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Command, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, Sparkles, User, Wand2 } from 'lucide-react';
import { Button, Card, Field, Input, Select, cn } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/* Shared split-screen shell for the auth pages: 3D-ish aurora panel + form. */
export function AuthLayout({ children, title, subtitle, footer, side }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-aurora-radial" />
        <div className="aurora opacity-70" />
        <div className="absolute inset-0 grid-bg opacity-50" />
      </div>

      <div className="relative flex flex-col justify-center px-5 py-12 sm:px-10 lg:px-16">
        <Link to="/" className="mb-10 inline-flex items-center gap-2 text-[13px] text-text-muted transition hover:text-text">
          <ArrowLeft size={14} aria-hidden="true" /> Back to overview
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <div className="mb-6 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet to-cyan font-display text-sm font-bold text-ink-950">H</span>
            <span className="font-display text-[15px] font-semibold">HCM Lite</span>
          </div>

          <h1 className="font-display text-[clamp(1.7rem,3vw,2.2rem)] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-text-muted">{subtitle}</p> : null}

          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-6 text-[13px] text-text-muted">{footer}</div> : null}
        </motion.div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-white/[0.07] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_30%,rgba(91,62,232,0.28),transparent_60%),radial-gradient(circle_at_30%_80%,rgba(34,211,238,0.16),transparent_55%)]" />
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" /> System online
          </div>
          {side}
          <div className="space-y-3">
            {[
              'Roles and data scope enforced on the server',
              'Every action written to the audit log',
              'AI answers only from your own records',
            ].map((line) => (
              <p key={line} className="flex items-center gap-2 text-[12.5px] text-text-muted">
                <span className="rounded-full bg-mint/15 p-0.5 text-mint"><Check size={11} aria-hidden="true" /></span>
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Login ---------------------------------- */

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@hcm.local', hint: 'company + payroll lock' },
  { role: 'HR', email: 'hr@hcm.local', hint: 'people + approvals' },
  { role: 'Employee', email: 'employee@hcm.local', hint: 'self-service' },
];

export default function Login() {
  const { login, refreshSession } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (!email || !password) {
      setErrors({
        ...(email ? {} : { email: 'Enter your email to continue' }),
        ...(password ? {} : { password: 'Enter your password to continue' }),
      });
      return;
    }
    setLoading(true);
    try {
      const data = await login(email.trim(), password);
      toast.success('Welcome back', data.mustChangePassword ? 'Please set a new password to continue.' : undefined);
      const to = location.state?.from || (data.mustChangePassword ? '/change-password' : '/app');
      navigate(to, { replace: true });
    } catch (err) {
      setErrors({ form: err.message });
      toast.error('Could not sign in', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to HCM Lite"
      subtitle="Three roles, one login. Your menu and your data are decided by the server."
      footer={
        <p>
          First time here? <Link to="/setup" className="text-violet-soft underline-offset-4 hover:underline">Run the first-run setup</Link>
        </p>
      }
      side={
        <div className="max-w-sm">
          <p className="font-display text-2xl font-semibold leading-snug">
            “Who is on leave today?”
            <span className="block text-text-muted">answered from your own records.</span>
          </p>
          <div className="mt-8 space-y-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.role}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword('Admin@12345');
                  toast.info(`${a.role} filled in`, a.hint);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left transition hover:border-violet/40 hover:bg-white/[0.06]"
              >
                <span>
                  <span className="block text-[12.5px] font-medium text-text">{a.role}</span>
                  <span className="block font-mono text-[10.5px] text-text-faint">{a.email}</span>
                </span>
                <ArrowRight size={14} className="text-text-faint" aria-hidden="true" />
              </button>
            ))}
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-text-faint">
            These accounts only exist if you seeded them. A fresh install sends you to first-run setup instead.
          </p>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errors.form ? (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {errors.form}
          </div>
        ) : null}

        <Field label="Work email" error={errors.email} required>
          {(props) => (
            <div className="relative">
              <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
              <Input {...props} type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" />
            </div>
          )}
        </Field>

        <Field label="Password" error={errors.password} required>
          {(props) => (
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
              <Input
                {...props}
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-11"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-text-faint transition hover:bg-white/5 hover:text-text"
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          )}
        </Field>

        <Button type="submit" size="lg" loading={loading} className="w-full" icon={ArrowRight}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-faint">
          JWT · 12h session · bcrypt hashes
        </p>
      </form>
    </AuthLayout>
  );
}

/* --------------------------------- Setup ---------------------------------- */

const DEFAULT_LEAVE = [
  { code: 'ANNUAL', label: 'Annual', quota: 14 },
  { code: 'SICK', label: 'Sick', quota: 8 },
  { code: 'CASUAL', label: 'Casual', quota: 10 },
];

export function Setup() {
  const { setupCompany, setup } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    companyName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirm: '',
    officeStart: '09:00',
    graceMinutes: 15,
    weekend: 'sat-sun',
    radius: 150,
    locationLabel: '',
  });

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (setup?.needsSetup === false) navigate('/login', { replace: true });
  }, [setup, navigate]);

  const next = () => {
    const e = {};
    if (step === 1) {
      if (form.companyName.trim().length < 2) e.companyName = 'Give your company a name';
      if (form.adminName.trim().length < 2) e.adminName = 'Enter your full name';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) e.adminEmail = 'Enter a valid email';
      if (form.adminPassword.length < 8) e.adminPassword = 'At least 8 characters';
      else if (!/[A-Za-z]/.test(form.adminPassword) || !/\d/.test(form.adminPassword)) e.adminPassword = 'Add a letter and a number';
      if (form.confirm !== form.adminPassword) e.confirm = 'Passwords do not match';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep(step + 1);
  };

  const submit = async () => {
    setLoading(true);
    setErrors({});
    try {
      const weekendDays = form.weekend === 'sat-sun' ? [6, 0] : form.weekend === 'fri-sat' ? [5, 6] : [0];
      await setupCompany({
        companyName: form.companyName.trim(),
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword,
        officeStart: form.officeStart,
        graceMinutes: Number(form.graceMinutes),
        weekendDays,
        office: { radius: Number(form.radius) || 150, label: form.locationLabel || 'Head office', lat: null, lng: null },
      });
      toast.success('Company created', 'You are signed in as the Admin. Set up departments next.');
      navigate('/app', { replace: true });
    } catch (err) {
      setErrors({ form: err.message, ...(err.details || {}) });
      toast.error('Setup failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Set up your company"
      subtitle="This runs once. It creates the company profile, the first Admin account and the standard leave types."
      footer={<p>Already configured? <Link to="/login" className="text-violet-soft underline-offset-4 hover:underline">Sign in instead</Link></p>}
      side={
        <div className="max-w-sm">
          <p className="font-display text-2xl font-semibold leading-snug">A fresh install asks questions. No sample data, no shortcuts.</p>
          <ol className="mt-8 space-y-3">
            {['Company profile + Admin', 'Departments & designations', 'HR creates the first employee', 'Check-in, leave, payroll'].map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-[12.5px] text-text-muted">
                <span className={cn('grid h-6 w-6 place-items-center rounded-full border text-[10.5px]', i === 0 ? 'border-violet/50 bg-violet/20 text-text' : 'border-white/10 text-text-faint')}>
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-2">
        {[1, 2].map((s) => (
          <div key={s} className={cn('h-1 flex-1 rounded-full transition-colors', step >= s ? 'bg-gradient-to-r from-violet to-cyan' : 'bg-white/10')} />
        ))}
        <span className="ml-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-faint">Step {step}/2</span>
      </div>

      {errors.form ? (
        <div role="alert" className="mb-4 rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose">{errors.form}</div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <Field label="Company name" error={errors.companyName} required>
            {(p) => <Input {...p} placeholder="Northwind Labs" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} autoFocus />}
          </Field>
          <Field label="Your name (Admin)" error={errors.adminName} required>
            {(p) => (
              <div className="relative">
                <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                <Input {...p} placeholder="Zara Ahmed" value={form.adminName} onChange={(e) => set('adminName', e.target.value)} className="pl-9" />
              </div>
            )}
          </Field>
          <Field label="Admin email" error={errors.adminEmail} required>
            {(p) => (
              <div className="relative">
                <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                <Input {...p} type="email" placeholder="admin@company.com" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} className="pl-9" />
              </div>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" error={errors.adminPassword} hint="8+ chars, one letter and one number" required>
              {(p) => (
                <div className="relative">
                  <KeyRound size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                  <Input {...p} type="password" value={form.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} className="pl-9" autoComplete="new-password" />
                </div>
              )}
            </Field>
            <Field label="Confirm password" error={errors.confirm} required>
              {(p) => <Input {...p} type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" />}
            </Field>
          </div>
          <Button onClick={next} size="lg" className="w-full" icon={ArrowRight}>Continue</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Office start" hint="Late is measured against this">
              {(p) => <Input {...p} type="time" value={form.officeStart} onChange={(e) => set('officeStart', e.target.value)} />}
            </Field>
            <Field label="Grace window (minutes)">
              {(p) => <Input {...p} type="number" min={0} max={120} value={form.graceMinutes} onChange={(e) => set('graceMinutes', e.target.value)} />}
            </Field>
          </div>

          <Field label="Weekend">
            {(p) => (
              <Select {...p} value={form.weekend} onChange={(e) => set('weekend', e.target.value)}>
                <option value="sat-sun">Saturday &amp; Sunday</option>
                <option value="fri-sat">Friday &amp; Saturday</option>
                <option value="sun">Sunday only</option>
              </Select>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Check-in radius (m)" hint="Geofence for camera check-in">
              {(p) => <Input {...p} type="number" min={20} max={5000} value={form.radius} onChange={(e) => set('radius', e.target.value)} />}
            </Field>
            <Field label="Office label">
              {(p) => <Input {...p} placeholder="Head office" value={form.locationLabel} onChange={(e) => set('locationLabel', e.target.value)} />}
            </Field>
          </div>

          <Card className="p-3.5">
            <p className="mb-2 flex items-center gap-2 text-[12.5px] font-medium text-text"><Sparkles size={14} className="text-cyan" aria-hidden="true" /> Leave types created for you</p>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_LEAVE.map((t) => (
                <span key={t.code} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-text-muted">
                  {t.label} · {t.quota} days
                </span>
              ))}
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-text-muted">Unpaid · unlimited</span>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)} icon={ArrowLeft}>Back</Button>
            <Button onClick={submit} loading={loading} size="lg" className="flex-1" icon={Wand2}>
              {loading ? 'Creating company…' : 'Create company & sign in'}
            </Button>
          </div>
          <p className="text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-faint">
            You can change every setting later · <Command size={9} className="inline" /> Admin → Settings
          </p>
        </div>
      )}
    </AuthLayout>
  );
}

/* ----------------------------- Change password ---------------------------- */

export function ChangePassword() {
  const { user, refreshSession, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const err = {};
    if (!current) err.current = 'Enter your temporary password';
    if (next.length < 8) err.next = 'At least 8 characters';
    else if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) err.next = 'Add a letter and a number';
    if (next !== confirm) err.confirm = 'Passwords do not match';
    setErrors(err);
    if (Object.keys(err).length) return;

    setLoading(true);
    try {
      await import('../lib/api').then(({ api }) => api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } }));
      await refreshSession();
      toast.success('Password updated', 'You can use HCM Lite normally now.');
      navigate('/app', { replace: true });
    } catch (e2) {
      setErrors({ form: e2.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Set a new password"
      subtitle={`Signed in as ${user?.name || 'employee'} — your temporary password must be replaced before you continue.`}
      footer={<button type="button" onClick={async () => { await logout(); navigate('/login'); }} className="text-violet-soft hover:underline">Sign out instead</button>}
      side={
        <div className="max-w-sm">
          <p className="font-display text-2xl font-semibold leading-snug">Temporary passwords are issued once and never stored in plain text.</p>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errors.form ? <div role="alert" className="rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose">{errors.form}</div> : null}
        <Field label="Temporary password" error={errors.current} required>
          {(p) => <Input {...p} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus autoComplete="current-password" />}
        </Field>
        <Field label="New password" error={errors.next} hint="At least 8 characters with a letter and a number" required>
          {(p) => <Input {...p} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />}
        </Field>
        <Field label="Confirm new password" error={errors.confirm} required>
          {(p) => <Input {...p} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">Save password</Button>
      </form>
    </AuthLayout>
  );
}
