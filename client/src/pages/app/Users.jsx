import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check, Copy, Eye, EyeOff, Info, KeyRound, Mail, Plus, Search, ShieldCheck, User, UserCheck, UserRound, UserX, Wand2,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader,
  Select, Skeleton, Table, Td, Th, Tr, cn,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { get, patch, post } from '../../lib/api';
import { relativeTime } from '../../lib/format';

const ROLE_TONE = { admin: 'rose', hr: 'cyan', employee: 'violet' };
const ROLE_LABEL = { admin: 'Admin', hr: 'HR', employee: 'Employee' };

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'admin', label: 'Admin' },
  { value: 'hr', label: 'HR' },
  { value: 'employee', label: 'Employee' },
  { value: 'inactive', label: 'Inactive' },
];

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';

function randomInt(max) {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/** 14-character password with upper, lower, digit and symbol — no ambiguous glyphs. */
function generatePassword(length = 14) {
  const required = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGITS[randomInt(DIGITS.length)],
    SYMBOLS[randomInt(SYMBOLS.length)],
  ];
  const alphabet = UPPER + LOWER + DIGITS + SYMBOLS;
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => alphabet[randomInt(alphabet.length)]);
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/* ---------------------------------- page ---------------------------------- */

export default function Users() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => get('/users'),
  });

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const users = data || [];

  const counts = useMemo(
    () => ({
      all: users.length,
      admin: users.filter((u) => u.role === 'admin').length,
      hr: users.filter((u) => u.role === 'hr').length,
      employee: users.filter((u) => u.role === 'employee').length,
      inactive: users.filter((u) => !u.isActive).length,
    }),
    [users],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesFilter = filter === 'all' ? true : filter === 'inactive' ? !u.isActive : u.role === filter;
      if (!matchesFilter) return false;
      if (!term) return true;
      return (
        String(u.name || '').toLowerCase().includes(term) ||
        String(u.email || '').toLowerCase().includes(term) ||
        String(u.employeeName || '').toLowerCase().includes(term)
      );
    });
  }, [users, filter, search]);

  const toggleActive = useMutation({
    mutationFn: (target) => patch(`/users/${target.id}`, { isActive: !target.isActive }),
    onMutate: (target) => setTogglingId(target.id),
    onSuccess: (updated) => {
      toast.success(updated.isActive ? 'Login activated' : 'Login deactivated', `${updated.email} ${updated.isActive ? 'can sign in again.' : 'can no longer sign in.'}`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org', 'summary'] });
    },
    onError: (err) => {
      if (err.status === 409) toast.warning('Action blocked', err.message);
      else if (err.status === 403) toast.error('Not allowed', err.message);
      else toast.error('Could not update login', err.message);
    },
    onSettled: () => setTogglingId(null),
  });

  const reset = useMutation({
    mutationFn: (id) => post(`/users/${id}/reset-password`),
    onSuccess: (result) => {
      setResetTarget(null);
      setResetResult(result);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Temporary password issued', `Share it with ${result.email} over a secure channel.`);
    },
    onError: (err) => {
      if (err.status === 403) toast.error('Not allowed', err.message);
      else toast.error('Could not reset password', err.message);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Logins & access"
        description="Admin creates HR logins and controls access. HR registers employees — each registration creates that employee's login automatically with a temporary password."
        actions={
          <Button icon={Plus} onClick={() => setCreateOpen(true)}>
            Create login
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className="shrink-0 rounded-xl border border-cyan/25 bg-cyan/10 p-2 text-cyan-soft">
            <ShieldCheck size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-text">Two ways an account is created</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
              Admin and HR logins are created from this screen. Employee logins are created by HR when they register the employee —
              employees are not added here. Every new login must set its own password at first sign-in.
            </p>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter logins">
            {FILTERS.map((option) => {
              const active = filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    'flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-medium transition',
                    active
                      ? 'border-violet/40 bg-violet/15 text-text'
                      : 'border-white/10 bg-white/[0.03] text-text-muted hover:border-white/20 hover:text-text',
                  )}
                >
                  {option.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10.5px] leading-none',
                      active ? 'bg-white/15 text-text' : 'bg-white/[0.06] text-text-faint',
                    )}
                  >
                    {counts[option.value] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          <Field label="Search logins" className="w-full lg:max-w-xs">
            {(p) => (
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                <Input
                  {...p}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, email or employee"
                  className="pl-9"
                />
              </div>
            )}
          </Field>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : isError ? (
          <ErrorState message={error?.message} onRetry={refetch} />
        ) : visible.length ? (
          <Table caption="Logins and access">
            <thead>
              <tr>
                <Th>Login</Th>
                <Th>Role</Th>
                <Th>Linked employee</Th>
                <Th>Last sign-in</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => {
                const isSelf = account.id === currentUser?.id;
                const busy = togglingId === account.id;
                return (
                  <Tr key={account.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={account.name} size={34} />
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium text-text">
                            {account.name}
                            {isSelf ? <span className="ml-1.5 text-[11px] font-normal text-text-faint">(you)</span> : null}
                          </p>
                          <p className="truncate text-[11.5px] text-text-faint">{account.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={ROLE_TONE[account.role] || 'neutral'}>{ROLE_LABEL[account.role] || account.role}</Badge>
                    </Td>
                    <Td>
                      {account.employeeName ? (
                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-text">{account.employeeName}</p>
                          <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-faint">{account.employeeCode}</p>
                        </div>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{account.lastLoginAt ? relativeTime(account.lastLoginAt) : 'Never'}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={account.isActive ? 'mint' : 'faint'} dot>
                          {account.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        {account.mustChangePassword ? <Badge tone="amber">Temp password</Badge> : null}
                      </div>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="md"
                          variant="secondary"
                          className="whitespace-nowrap px-3"
                          icon={account.isActive ? UserX : UserCheck}
                          loading={busy}
                          disabled={isSelf && account.isActive}
                          title={isSelf && account.isActive ? "You can't deactivate the account you are signed in with." : undefined}
                          onClick={() => toggleActive.mutate(account)}
                        >
                          {account.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          size="md"
                          variant="ghost"
                          className="whitespace-nowrap px-3"
                          icon={KeyRound}
                          onClick={() => setResetTarget(account)}
                        >
                          Reset password
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={UserRound}
            title={users.length ? 'No logins match these filters' : 'No logins yet'}
            description={
              users.length
                ? 'Try a different role filter or clear the search to see every login.'
                : 'Create the first HR login, or register an employee so their login is created automatically.'
            }
            action={
              users.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter('all');
                    setSearch('');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button icon={Plus} onClick={() => setCreateOpen(true)}>Create login</Button>
              )
            }
          />
        )}
      </Card>

      <CreateLoginModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <ConfirmDialog
        open={Boolean(resetTarget)}
        onClose={() => {
          if (!reset.isPending) setResetTarget(null);
        }}
        onConfirm={() => reset.mutate(resetTarget.id)}
        title="Reset password?"
        description={resetTarget ? `A new temporary password will be issued for ${resetTarget.name} (${resetTarget.email}). Their current password stops working immediately and they must change it at next sign-in.` : ''}
        confirmLabel="Reset password"
        loading={reset.isPending}
      />

      <ResetResultModal result={resetResult} onClose={() => setResetResult(null)} />
    </div>
  );
}

/* ------------------------------ create login ------------------------------ */

function CreateLoginModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'hr' });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(true);

  useEffect(() => {
    if (open) {
      setForm({ name: '', email: '', password: '', role: 'hr' });
      setErrors({});
      setShowPassword(true);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: (body) => post('/users', body),
    onSuccess: (created) => {
      toast.success('Login created', `${created.email} must change the temporary password at first sign-in.`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org', 'summary'] });
      onClose();
    },
    onError: (err) => {
      setErrors(err.details || {});
      if (err.status === 409) toast.error('Email already used', err.message);
      else if (err.status === 403) toast.error('Not allowed', err.message);
      else toast.error('Could not create login', err.message);
    },
  });

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const generate = () => {
    const password = generatePassword();
    setForm((f) => ({ ...f, password }));
    setShowPassword(true);
    setErrors((e) => ({ ...e, password: undefined }));
    toast.info('Password generated', 'Copy it before you create the login — it is not shown again.');
  };

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter the person’s full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    if (form.password.length < 8) next.password = 'At least 8 characters';
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) next.password = 'Add a letter and a number';
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      role: form.role,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a login"
      description="For an Admin or HR account. Employee logins come from the Employees screen."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="create-login-form" loading={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create login'}
          </Button>
        </>
      }
    >
      <form id="create-login-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Full name" error={errors.name} required>
          {(p) => (
            <div className="relative">
              <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
              <Input
                {...p}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Zara Ahmed"
                autoComplete="name"
                className="pl-9"
              />
            </div>
          )}
        </Field>

        <Field label="Work email" error={errors.email} required>
          {(p) => (
            <div className="relative">
              <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
              <Input
                {...p}
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="hr@company.com"
                autoComplete="email"
                className="pl-9"
              />
            </div>
          )}
        </Field>

        <Field
          label="Temporary password"
          error={errors.password}
          hint="Shared once. The user must replace it at first sign-in."
          required
        >
          {(p) => (
            <div className="space-y-2">
              <div className="relative">
                <KeyRound size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                <Input
                  {...p}
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="pl-9 pr-12 font-mono text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-text-faint transition hover:bg-white/5 hover:text-text"
                >
                  {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" icon={Wand2} onClick={generate}>
                  Generate
                </Button>
                <span className="text-[11.5px] text-text-faint">14 characters · mixed case, number, symbol</span>
              </div>
            </div>
          )}
        </Field>

        <Field label="Role" error={errors.role} hint="HR sees people and approvals. Admin sees everything, including the payroll lock.">
          {(p) => (
            <Select {...p} value={form.role} onChange={(e) => set('role', e.target.value)}>
              <option value="hr">HR</option>
              <option value="admin">Admin</option>
            </Select>
          )}
        </Field>

        <div className="flex items-start gap-2 rounded-xl border border-amber/25 bg-amber/[0.07] px-3.5 py-3">
          <Info size={14} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
          <p className="text-[12.5px] leading-relaxed text-text-muted">
            The new user is signed in with this password once, then must choose a new one before reaching the app.
          </p>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------------- reset password ----------------------------- */

function ResetResultModal({ result, onClose }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [result]);

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.tempPassword);
      setCopied(true);
      toast.success('Password copied', 'Paste it somewhere safe before closing this panel.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy automatically', 'Select the password and copy it manually.');
    }
  };

  return (
    <Modal
      open={Boolean(result)}
      onClose={onClose}
      title="Temporary password"
      description="Shown once — share it over a secure channel."
      size="sm"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-ink-900/60 p-3.5">
          <p className="label-mono">Login</p>
          <p className="mt-0.5 truncate text-[13px] text-text">{result?.email}</p>

          <p className="label-mono mt-3">Temporary password</p>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 font-mono text-[13px] text-text">
              {result?.tempPassword}
            </code>
            <Button variant="secondary" icon={copied ? Check : Copy} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-text-muted">
          <Info size={14} className="mt-0.5 shrink-0 text-cyan" aria-hidden="true" />
          Their old password no longer works. They must set a new password at their next sign-in.
        </p>
      </div>
    </Modal>
  );
}
