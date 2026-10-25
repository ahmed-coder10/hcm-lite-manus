import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase, Building2, CalendarCheck, CalendarDays, Download, KeyRound, Mail, Palmtree, Phone, Save,
  ShieldCheck, UserRound, Users, Wallet,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, Progress,
  Skeleton, Tabs, Textarea, cn,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { downloadFile, get, patch, post } from '../../lib/api';
import {
  PKR, STATUS_TONE, dateLabel, hoursFromMinutes, monthLabel, number, relativeTime, statusLabel, titleCase,
} from '../../lib/format';

const ROLE_TONE = { admin: 'rose', hr: 'cyan', employee: 'violet' };
const ROLE_LABEL = { admin: 'Admin', hr: 'HR', employee: 'Employee' };

const TABS = [
  { value: 'details', label: 'Details' },
  { value: 'contact', label: 'Contact' },
  { value: 'security', label: 'Security' },
  { value: 'payslips', label: 'Payslips' },
];

const PHONE_RE = /^[+\d][\d\s()-]{6,19}$/;

/* ---------------------------------- page ---------------------------------- */

export default function Profile() {
  const sessionQuery = useQuery({
    queryKey: ['profile', 'session'],
    queryFn: () => get('/auth/me'),
  });
  const session = sessionQuery.data;

  const employeeQuery = useQuery({
    queryKey: ['profile', 'employee'],
    queryFn: () => get('/employees/me'),
    enabled: Boolean(session),
    retry: false,
  });

  const [tab, setTab] = useState(null);

  const user = session?.user;
  const employee = employeeQuery.data?.employee || session?.employee || null;
  const hasEmployee = Boolean(employee);
  const activeTab = tab || (hasEmployee ? 'details' : 'security');
  const extrasLoading = employeeQuery.isLoading;

  if (sessionQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="My account"
          title="Profile"
          description="Your personal and job details, contact information, password and payslips."
        />
        <Skeleton className="h-40" />
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="My account" title="Profile" description="Your details, contact information, password and payslips." />
        <Card>
          <ErrorState message={sessionQuery.error?.message} onRetry={sessionQuery.refetch} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My account"
        title="Profile"
        description="Your personal and job details, contact information, password and payslips."
      />

      <ProfileHeaderCard user={user} employee={employee} hasEmployee={hasEmployee} onChangePassword={() => setTab('security')} />

      {hasEmployee ? (
        <>
          <div className="no-scrollbar -mx-1 overflow-x-auto px-1 pb-1">
            <Tabs tabs={TABS} value={activeTab} onChange={setTab} />
          </div>

          {employeeQuery.isError && employeeQuery.error?.status !== 404 ? (
            <Card>
              <ErrorState message={employeeQuery.error?.message} onRetry={employeeQuery.refetch} />
            </Card>
          ) : null}

          {activeTab === 'details' ? (
            <DetailsTab employee={employee} employeeData={employeeQuery.data} loading={extrasLoading} />
          ) : null}
          {activeTab === 'contact' ? <ContactTab employee={employee} /> : null}
          {activeTab === 'security' ? <SecurityTab user={user} /> : null}
          {activeTab === 'payslips' ? <PayslipsTab /> : null}
        </>
      ) : (
        <>
          <NoEmployeeCard user={user} />
          <SecurityTab user={user} />
        </>
      )}
    </div>
  );
}

/* --------------------------------- header --------------------------------- */

function ProfileHeaderCard({ user, employee, hasEmployee, onChangePassword }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-violet/15 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={user?.name} size={64} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold tracking-tight text-text">{user?.name}</h2>
              <Badge tone={ROLE_TONE[user?.role] || 'neutral'}>{ROLE_LABEL[user?.role] || user?.role}</Badge>
              {user?.mustChangePassword ? <Badge tone="amber" dot>Password change pending</Badge> : null}
            </div>

            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-text-muted">
              <Mail size={13} aria-hidden="true" />
              <span className="truncate">{user?.email}</span>
            </p>

            {hasEmployee ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-text-muted">
                <span className="flex items-center gap-1.5">
                  <Building2 size={13} className="text-text-faint" aria-hidden="true" />
                  {employee.departmentName || 'No department'}
                  {employee.designationTitle ? ` · ${employee.designationTitle}` : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={13} className="text-text-faint" aria-hidden="true" />
                  Joined {dateLabel(employee.joinDate)}
                </span>
                <Badge tone={STATUS_TONE[employee.status] || 'neutral'} dot>{statusLabel(employee.status)}</Badge>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-text-faint">
                <UserRound size={13} aria-hidden="true" />
                Not linked to an employee profile
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {employee?.employeeCode ? (
            <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
              {employee.employeeCode}
            </span>
          ) : null}
          {hasEmployee ? (
            <Button variant="secondary" icon={KeyRound} onClick={onChangePassword}>
              Change password
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------- no employee ------------------------------ */

function NoEmployeeCard({ user }) {
  const isAdmin = user?.role === 'admin';
  const isStaff = isAdmin || user?.role === 'hr';
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="shrink-0 rounded-2xl border border-amber/25 bg-amber/10 p-3 text-amber">
          <UserRound size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold text-text">No employee profile linked</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-text-muted">
            {isAdmin
              ? 'This Admin account is not linked to an employee profile.'
              : 'This account is not linked to an employee profile.'}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
            Attendance, leave, payslips and contact details live on employee accounts. Admin and HR logins manage the
            system without one; HR can register you as an employee if you need self-service.
          </p>
          {isStaff ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button as={Link} to="/app/users" variant="secondary" icon={ShieldCheck}>
                Logins &amp; access
              </Button>
              <Button as={Link} to="/app/employees" variant="secondary" icon={Users}>
                Open employees
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------- details -------------------------------- */

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/[0.05] py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-[12px] text-text-faint">{label}</dt>
      <dd className={cn('min-w-0 break-words text-[13px] text-text sm:text-right', mono && 'font-mono text-[12px]')}>
        {value || '—'}
      </dd>
    </div>
  );
}

function DetailsTab({ employee, employeeData, loading }) {
  const salary = employee.salary || {};
  const attendance = employeeData?.attendance;
  const leaveBalances = employeeData?.leaveBalances || [];
  const emergency = employee.emergencyContact || {};
  const emergencyText = emergency.name
    ? `${emergency.name}${emergency.relation ? ` (${emergency.relation})` : ''}${emergency.phone ? ` · ${emergency.phone}` : ''}`
    : '';

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" subtitle="Contact details are yours to edit on the Contact tab." icon={UserRound} />
          <dl className="px-5 py-2">
            <InfoRow label="Full name" value={employee.fullName} />
            <InfoRow label="Employee code" value={employee.employeeCode} mono />
            <InfoRow label="Email" value={employee.email} />
            <InfoRow label="Phone" value={employee.phone} />
            <InfoRow label="CNIC" value={employee.cnic} mono />
            <InfoRow label="Date of birth" value={employee.dateOfBirth ? dateLabel(employee.dateOfBirth) : ''} />
            <InfoRow label="Gender" value={employee.gender ? titleCase(employee.gender) : ''} />
            <InfoRow label="City" value={employee.city} />
            <InfoRow label="Address" value={employee.address} />
            <InfoRow label="Emergency contact" value={emergencyText} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Job details" subtitle="Set by HR — ask them to correct anything here." icon={Briefcase} />
          <dl className="px-5 py-2">
            <InfoRow label="Department" value={employee.departmentName} />
            <InfoRow label="Designation" value={employee.designationTitle} />
            <InfoRow label="Reports to" value={employee.managerName} />
            <InfoRow label="Employment type" value={employee.employmentType ? titleCase(employee.employmentType) : ''} />
            <InfoRow label="Join date" value={dateLabel(employee.joinDate)} />
            {employee.exitDate ? <InfoRow label="Exit date" value={dateLabel(employee.exitDate)} /> : null}
            <InfoRow
              label="Status"
              value={<Badge tone={STATUS_TONE[employee.status] || 'neutral'} dot>{statusLabel(employee.status)}</Badge>}
            />
          </dl>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader title="Compensation" subtitle="Your monthly package." icon={Wallet} />
          <div className="p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <MoneyRow label="Basic" value={salary.basic} />
              <MoneyRow label={`House rent (${salary.houseRentPct ?? 0}%)`} value={salary.hra} />
              <MoneyRow label={`Medical (${salary.medicalPct ?? 0}%)`} value={salary.medical} />
              <MoneyRow label="Other allowances" value={salary.otherAllowances} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-violet/25 bg-violet/10 px-4 py-3">
              <span className="text-[12.5px] text-text-muted">Gross monthly</span>
              <span className="font-display text-lg font-semibold text-text">{PKR(salary.gross || 0)}</span>
            </div>
            <dl className="mt-4 grid gap-3 border-t border-white/[0.06] pt-3 sm:grid-cols-3">
              <div>
                <dt className="label-mono">Bank</dt>
                <dd className="mt-0.5 text-[12.5px] text-text">{salary.bankName || '—'}</dd>
              </div>
              <div>
                <dt className="label-mono">Account title</dt>
                <dd className="mt-0.5 text-[12.5px] text-text">{salary.accountTitle || '—'}</dd>
              </div>
              <div>
                <dt className="label-mono">Account number</dt>
                <dd className="mt-0.5 break-all font-mono text-[11.5px] text-text">{salary.accountNumber || '—'}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="This month" subtitle="Attendance from your own records." icon={CalendarCheck} />
            <div className="p-4">
              {loading ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : attendance ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { label: 'Present', value: number(attendance.present) },
                    { label: 'Late', value: number(attendance.late) },
                    { label: 'Half days', value: number(attendance.halfDay) },
                    { label: 'Hours', value: hoursFromMinutes(attendance.totalMinutes) },
                    { label: 'Working days', value: number(attendance.workingDays) },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                      <p className="label-mono">{stat.label}</p>
                      <p className="mt-0.5 font-display text-[15px] font-semibold text-text">{stat.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12.5px] text-text-faint">Attendance for this month is not available.</p>
              )}
              <div className="mt-3 text-right">
                <Button as={Link} to="/app/attendance" variant="ghost" icon={CalendarCheck}>
                  Open attendance
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Leave balance" subtitle={`${new Date().getFullYear()} entitlement`} icon={Palmtree} />
            <div className="p-5">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : leaveBalances.length ? (
                <ul className="space-y-4">
                  {leaveBalances.map((balance) => (
                    <li key={balance.leaveTypeId}>
                      <div className="flex items-center justify-between gap-3 text-[12.5px]">
                        <span className="flex min-w-0 items-center gap-2 text-text">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: balance.color || '#7C5CFF' }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{balance.name}</span>
                        </span>
                        <span className="shrink-0 text-text-muted">
                          {balance.remaining == null ? 'Unlimited' : `${balance.remaining} of ${balance.allocated} left`}
                        </span>
                      </div>
                      {balance.allocated ? (
                        <Progress
                          className="mt-2"
                          value={((balance.allocated - balance.remaining) / balance.allocated) * 100}
                          tone="violet"
                          label={`${balance.name} used`}
                        />
                      ) : null}
                      <p className="mt-1 text-[11.5px] text-text-faint">
                        {balance.used} day{balance.used === 1 ? '' : 's'} used this year
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={Palmtree}
                  title="No leave balances"
                  description="Leave balances appear here once HR configures leave types."
                  className="py-8"
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MoneyRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <span className="text-[12px] text-text-muted">{label}</span>
      <span className="font-mono text-[12.5px] text-text">{PKR(value || 0)}</span>
    </div>
  );
}

/* --------------------------------- contact -------------------------------- */

const contactFormFrom = (employee) => ({
  phone: employee?.phone || '',
  address: employee?.address || '',
  city: employee?.city || '',
  emergencyName: employee?.emergencyContact?.name || '',
  emergencyPhone: employee?.emergencyContact?.phone || '',
  emergencyRelation: employee?.emergencyContact?.relation || '',
});

function ContactTab({ employee }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { refreshSession } = useAuth();
  const [form, setForm] = useState(() => contactFormFrom(employee));
  const [errors, setErrors] = useState({});
  const employeeId = employee?.id;

  useEffect(() => {
    setForm(contactFormFrom(employee));
    setErrors({});
    // Only re-seed when the employee record itself changes, never on background refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: (body) => patch('/employees/me/contact', body),
    onSuccess: async (updated) => {
      setForm(contactFormFrom(updated));
      setErrors({});
      toast.success('Contact details saved', 'HR sees the new details immediately.');
      queryClient.invalidateQueries({ queryKey: ['profile', 'employee'] });
      queryClient.invalidateQueries({ queryKey: ['profile', 'session'] });
      await refreshSession();
    },
    onError: (err) => {
      setErrors(err.details || {});
      toast.error('Could not save contact details', err.message);
    },
  });

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) next.phone = 'Enter a valid phone number';
    if (form.emergencyPhone.trim() && !PHONE_RE.test(form.emergencyPhone.trim())) {
      next.emergencyPhone = 'Enter a valid phone number';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      phone: form.phone.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      emergencyName: form.emergencyName.trim(),
      emergencyPhone: form.emergencyPhone.trim(),
      emergencyRelation: form.emergencyRelation.trim(),
    });
  };

  return (
    <Card>
      <CardHeader
        title="Contact details"
        subtitle="Only your phone, address and emergency contact are editable here."
        icon={Phone}
      />
      <form onSubmit={submit} noValidate className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" error={errors.phone} hint="Include the country or city code.">
            {(p) => (
              <Input
                {...p}
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+92 300 1234567"
                autoComplete="tel"
              />
            )}
          </Field>
          <Field label="City" error={errors.city}>
            {(p) => (
              <Input
                {...p}
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Karachi"
                autoComplete="address-level2"
              />
            )}
          </Field>
        </div>

        <Field label="Address" error={errors.address}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="House, street, area"
              autoComplete="street-address"
            />
          )}
        </Field>

        <div className="border-t border-white/[0.06] pt-5">
          <p className="text-[12.5px] font-medium text-text-muted">Emergency contact</p>
          <p className="mt-0.5 text-[12px] text-text-faint">Who we should call if something happens at work.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Full name" error={errors.emergencyName}>
              {(p) => (
                <Input
                  {...p}
                  value={form.emergencyName}
                  onChange={(e) => set('emergencyName', e.target.value)}
                  placeholder="Ayesha Khan"
                  autoComplete="name"
                />
              )}
            </Field>
            <Field label="Phone number" error={errors.emergencyPhone}>
              {(p) => (
                <Input
                  {...p}
                  type="tel"
                  value={form.emergencyPhone}
                  onChange={(e) => set('emergencyPhone', e.target.value)}
                  placeholder="+92 321 7654321"
                />
              )}
            </Field>
            <Field label="Relationship" error={errors.emergencyRelation}>
              {(p) => (
                <Input
                  {...p}
                  value={form.emergencyRelation}
                  onChange={(e) => set('emergencyRelation', e.target.value)}
                  placeholder="Spouse, sibling, friend"
                />
              )}
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-text-faint">Salary, department and designation are changed by HR.</p>
          <Button type="submit" loading={save.isPending} icon={Save} className="w-full sm:w-auto">
            {save.isPending ? 'Saving…' : 'Save contact details'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* -------------------------------- security -------------------------------- */

function SecurityTab({ user }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { refreshSession } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [show, setShow] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const change = useMutation({
    mutationFn: (body) => post('/auth/change-password', body),
    onSuccess: async () => {
      setForm({ current: '', next: '', confirm: '' });
      setErrors({});
      toast.success('Password updated', 'Use your new password the next time you sign in.');
      queryClient.invalidateQueries({ queryKey: ['profile', 'session'] });
      await refreshSession();
    },
    onError: (err) => {
      const details = err.details || {};
      if (err.status === 403) {
        setErrors({ current: err.message });
      } else {
        setErrors({
          form: err.message,
          ...details,
          ...(details.currentPassword ? { current: details.currentPassword } : {}),
          ...(details.newPassword ? { next: details.newPassword } : {}),
        });
      }
      toast.error('Could not change password', err.message);
    },
  });

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!form.current) next.current = 'Enter your current password';
    if (form.next.length < 8) next.next = 'At least 8 characters';
    else if (!/[A-Za-z]/.test(form.next) || !/\d/.test(form.next)) next.next = 'Add a letter and a number';
    else if (form.next === form.current) next.next = 'Choose a password you have not used here';
    if (form.confirm !== form.next) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;
    change.mutate({ currentPassword: form.current, newPassword: form.next });
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Password" subtitle="Change the password you sign in with." icon={ShieldCheck} />
        <form onSubmit={submit} noValidate className="space-y-4 p-5">
          {errors.form ? (
            <div role="alert" className="rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose">
              {errors.form}
            </div>
          ) : null}

          {user?.mustChangePassword ? (
            <div className="rounded-xl border border-amber/25 bg-amber/[0.07] px-3.5 py-3 text-[12.5px] leading-relaxed text-text-muted">
              Your temporary password is still active. Set a new one below to finish activating your account.
            </div>
          ) : null}

          <Field label="Current password" error={errors.current} required>
            {(p) => (
              <div className="relative">
                <KeyRound size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                <Input
                  {...p}
                  type={show ? 'text' : 'password'}
                  value={form.current}
                  onChange={(e) => set('current', e.target.value)}
                  autoComplete="current-password"
                  className="pl-9"
                />
              </div>
            )}
          </Field>

          <Field label="New password" error={errors.next} hint="At least 8 characters with a letter and a number." required>
            {(p) => (
              <Input
                {...p}
                type={show ? 'text' : 'password'}
                value={form.next}
                onChange={(e) => set('next', e.target.value)}
                autoComplete="new-password"
              />
            )}
          </Field>

          <Field label="Confirm new password" error={errors.confirm} required>
            {(p) => (
              <Input
                {...p}
                type={show ? 'text' : 'password'}
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
                autoComplete="new-password"
              />
            )}
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-text-muted">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="h-4 w-4 accent-violet"
            />
            Show passwords while I type
          </label>

          <Button type="submit" className="w-full" loading={change.isPending}>
            {change.isPending ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Account" subtitle="Your login and last session." icon={KeyRound} />
        <dl className="px-5 py-2">
          <InfoRow label="Email" value={user?.email} />
          <InfoRow label="Role" value={<Badge tone={ROLE_TONE[user?.role] || 'neutral'}>{ROLE_LABEL[user?.role] || user?.role}</Badge>} />
          <InfoRow label="Password status" value={user?.mustChangePassword ? 'Temporary password' : 'Set by you'} />
          <InfoRow
            label="Last sign-in"
            value={user?.lastLoginAt ? `${relativeTime(user.lastLoginAt)} · ${dateLabel(user.lastLoginAt)}` : 'This session'}
          />
        </dl>
      </Card>
    </div>
  );
}

/* -------------------------------- payslips -------------------------------- */

function PayslipsTab() {
  const toast = useToast();
  const [downloading, setDownloading] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['profile', 'payslips'],
    queryFn: () => get('/payroll/me/payslips'),
  });

  const payslips = [...(data || [])].sort((a, b) => String(b.month).localeCompare(String(a.month)));

  const download = async (payslip) => {
    setDownloading(payslip.id);
    try {
      await downloadFile(`/payroll/payslips/${payslip.id}.pdf`, `payslip-${payslip.month}.pdf`);
      toast.success('Payslip downloaded', monthLabel(payslip.month));
    } catch (err) {
      toast.error('Could not download payslip', err.message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Payslips"
        subtitle="Download the PDF for any month that has been paid."
        icon={Wallet}
        action={<Badge tone="neutral">{number(payslips.length)}</Badge>}
      />

      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : isError ? (
        <ErrorState message={error?.message} onRetry={refetch} />
      ) : payslips.length ? (
        <ul className="divide-y divide-white/[0.05]">
          {payslips.map((payslip) => (
            <li key={payslip.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold text-text">{monthLabel(payslip.month)}</p>
                <p className="mt-0.5 text-[12.5px] text-text-muted">
                  Gross <span className="font-mono text-text">{PKR(payslip.gross)}</span>
                  <span className="mx-1.5 text-text-faint" aria-hidden="true">·</span>
                  Net <span className="font-mono text-text">{PKR(payslip.net)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[payslip.runStatus] || 'neutral'}>{statusLabel(payslip.runStatus)}</Badge>
                <Button
                  variant="secondary"
                  icon={Download}
                  loading={downloading === payslip.id}
                  onClick={() => download(payslip)}
                >
                  {downloading === payslip.id ? 'Downloading…' : 'Download PDF'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Wallet}
          title="No payslips yet"
          description="Payslip PDFs appear here once payroll has been run for a month."
        />
      )}
    </Card>
  );
}
