import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowRight, ArrowUpRight, CalendarCheck, CalendarDays, Clock, LogIn, LogOut, Megaphone, Sparkles, Timer,
  TrendingUp, UserRound, Users, Wallet, AlertTriangle,
} from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Progress, Skeleton, StatCard, cn,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { get, post } from '../../lib/api';
import { PKR, dateLabel, hoursFromMinutes, number, pct, statusLabel, STATUS_TONE, timeLabel, todayKey } from '../../lib/format';

const PALETTE = ['#7C5CFF', '#22D3EE', '#3DDC97', '#FFB86B', '#FF6B8A'];

const tooltipStyle = {
  background: '#0B0E18',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  fontSize: 12,
  color: '#EEF1F8',
  boxShadow: '0 24px 60px -32px rgba(0,0,0,0.9)',
};

function ChartCard({ title, subtitle, icon, action, children, className, height = 260 }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} action={action} />
      <div className="p-4" style={{ height }}>
        {children}
      </div>
    </Card>
  );
}

function AiSummaryCard({ role }) {
  const toast = useToast();
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await post('/ai/summary');
      setInsights(res.insights || []);
      setAiGenerated(Boolean(res.aiGenerated));
      toast.success('Summary ready', res.aiGenerated ? 'Generated from the current KPI snapshot.' : 'Answered by the local rules engine.');
    } catch (err) {
      toast.error('Could not summarise', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet/20 blur-3xl" aria-hidden="true" />
      <CardHeader
        title="Dashboard summary"
        subtitle="3–5 insights from the numbers on this screen"
        icon={Sparkles}
        action={<Badge tone={aiGenerated ? 'violet' : 'neutral'}>{aiGenerated ? 'AI-generated' : 'deterministic'}</Badge>}
      />
      <div className="p-4">
        {insights?.length ? (
          <ul className="space-y-2">
            {insights.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-text-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-relaxed text-text-muted">
            Turn the numbers on this page into a few plain sentences — useful at the start of a demo.
          </p>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" loading={loading} onClick={run} icon={Sparkles}>Summarize</Button>
          <Button as={Link} to="/app/assistant" size="sm" variant="ghost" icon={ArrowRight}>Open assistant</Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------- employee view ----------------------------- */

function EmployeeDashboard() {
  const { employee } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/analytics/dashboard') });
  const [punching, setPunching] = useState(false);

  const punch = async (kind) => {
    setPunching(true);
    try {
      let location = null;
      try {
        location = await new Promise((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 6000 },
          );
        });
      } catch {
        location = null;
      }
      const res = await post(`/attendance/${kind === 'in' ? 'check-in' : 'check-out'}`, { source: 'web', location });
      toast.success(kind === 'in' ? 'Checked in' : 'Checked out', res.message);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch (err) {
      toast.error('Could not record attendance', err.message);
    } finally {
      setPunching(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  const k = data.kpis;
  const today = data.today;
  const weekPct = Math.min(100, Math.round((k.hoursThisWeek / k.targetHours) * 100));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${dateLabel(todayKey(), { weekday: true })}`}
        title={`Hello, ${employee?.firstName || 'there'}`}
        description="Your day, your hours and your leave — all from your own records."
        actions={
          <Button as={Link} to="/app/attendance" variant="secondary" size="sm" icon={CalendarCheck}>
            Full attendance
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Today */}
        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-violet/20 blur-3xl" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label-mono">Today</p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
                {today.checkInTime || '—'}
                <span className="mx-2 text-base font-normal text-text-faint">→</span>
                {today.checkOutTime || '—'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[today.status] || 'neutral'} dot>{statusLabel(today.status)}</Badge>
                {today.workedMinutes ? <Badge tone="neutral">{hoursFromMinutes(today.workedMinutes)} logged</Badge> : null}
                {data.kpis.lateThisMonth ? <Badge tone="amber">{data.kpis.lateThisMonth} late this month</Badge> : null}
              </div>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-soft">
              <Timer size={18} aria-hidden="true" />
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {today.canCheckIn ? (
              <Button onClick={() => punch('in')} loading={punching} icon={LogIn}>Check in</Button>
            ) : today.canCheckOut ? (
              <Button onClick={() => punch('out')} loading={punching} icon={LogOut}>Check out</Button>
            ) : (
              <Badge tone="mint" dot>Day complete</Badge>
            )}
            <Button as={Link} to="/app/attendance" variant="secondary" size="md" icon={CalendarCheck}>
              Camera check-in
            </Button>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-text-faint">
            The server stamps the time. Your location is only used to confirm you are inside the office radius.
          </p>
        </Card>

        {/* Week progress */}
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="label-mono">This week</p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
                {k.hoursThisWeek}<span className="text-base font-normal text-text-faint"> / {k.targetHours} h</span>
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-cyan-soft">
              <Clock size={18} aria-hidden="true" />
            </span>
          </div>
          <Progress value={weekPct} className="mt-5" label="Weekly hours" />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Late', k.lateThisMonth],
              ['Absent', k.absentThisMonth],
              ['On leave', k.leaveTakenThisMonth],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] py-2">
                <p className="font-display text-lg font-semibold">{value}</p>
                <p className="text-[11px] text-text-faint">{label}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Leave balance" subtitle="Approved leave is deducted automatically" icon={CalendarDays} action={<Button as={Link} to="/app/leave" size="sm" variant="ghost" icon={ArrowRight}>Apply</Button>} />
          <div className="space-y-3 p-4">
            {(data.leaveBalances || []).length ? (
              data.leaveBalances.map((b) => {
                const ratio = b.unlimited ? 100 : Math.min(100, Math.round((b.used / (b.allocated || 1)) * 100));
                return (
                  <div key={b.leaveTypeId}>
                    <div className="mb-1 flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-2 text-text">
                        <span className="h-2 w-2 rounded-full" style={{ background: b.color }} aria-hidden="true" />
                        {b.name}
                      </span>
                      <span className="text-text-muted">
                        {b.unlimited ? 'Unlimited' : `${b.remaining} of ${b.allocated} days left`}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className="h-full rounded-full" style={{ width: `${b.unlimited ? 0 : ratio}%`, background: b.color }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState title="No leave types yet" description="Your HR team needs to configure leave types first." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Announcements" icon={Megaphone} action={<Button as={Link} to="/app/announcements" size="sm" variant="ghost">All</Button>} />
          <div className="divide-y divide-white/[0.05]">
            {(data.announcements || []).length ? (
              data.announcements.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {a.pinned ? <Badge tone="amber">Pinned</Badge> : null}
                    <p className="truncate text-[13px] font-medium text-text">{a.title}</p>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-text-muted">{a.body}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint">{dateLabel(a.publishedAt)}</p>
                </div>
              ))
            ) : (
              <EmptyState title="Nothing posted yet" description="Announcements from HR will appear here." />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Your recent days" subtitle="Last two weeks" icon={CalendarCheck} />
        <div className="flex flex-wrap gap-1.5 p-4">
          {(data.calendar || []).map((d) => (
            <span
              key={d.date}
              title={`${d.date} · ${statusLabel(d.status)}`}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-lg border text-[10px] font-medium',
                d.status === 'present' && 'border-mint/30 bg-mint/15 text-mint',
                d.status === 'late' && 'border-amber/30 bg-amber/15 text-amber',
                d.status === 'half_day' && 'border-amber/25 bg-amber/10 text-amber',
                d.status === 'on_leave' && 'border-violet/30 bg-violet/15 text-violet-soft',
                d.status === 'absent' && 'border-rose/30 bg-rose/15 text-rose',
                d.status === 'missing_checkout' && 'border-amber/25 bg-amber/10 text-amber',
                !['present', 'late', 'half_day', 'on_leave', 'absent', 'missing_checkout'].includes(d.status) && 'border-white/10 bg-white/[0.03] text-text-faint',
              )}
            >
              {d.date.slice(8)}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------- HR view -------------------------------- */

function HrDashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/analytics/dashboard') });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </div>
    );
  }
  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  const k = data.kpis;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={data.today.holiday ? `Holiday · ${data.today.holiday}` : data.today.weekend ? 'Weekend' : `Today · ${dateLabel(data.today.date, { weekday: true })}`}
        title="HR command centre"
        description="Everyone's day at a glance — present, late, on leave and waiting for you."
        actions={
          <>
            <Button as={Link} to="/app/employees" size="sm" variant="secondary" icon={Users}>Add employee</Button>
            <Button as={Link} to="/app/leave" size="sm" icon={ArrowRight}>Approvals {k.pendingApprovals ? `(${k.pendingApprovals})` : ''}</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Headcount" value={number(k.headcount)} hint={`${k.departments} departments`} icon={Users} tone="violet" />
        <StatCard label="Present today" value={number(k.presentToday)} hint={`${k.lateToday} late`} icon={CalendarCheck} tone="mint" />
        <StatCard label="On leave today" value={number(k.onLeaveToday)} hint={`${k.absentToday} absent`} icon={CalendarDays} tone="cyan" />
        <StatCard label="Attendance rate" value={pct(k.attendanceRate)} hint="this month" icon={TrendingUp} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Attendance trend" subtitle="Last 14 days" icon={TrendingUp} height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3DDC97" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3DDC97" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="lateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFB86B" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#FFB86B" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fill: '#6B7488', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7488', fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => dateLabel(v)} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9AA3B8' }} />
              <Area type="monotone" dataKey="present" name="Present" stroke="#3DDC97" strokeWidth={2} fill="url(#presentGrad)" />
              <Area type="monotone" dataKey="late" name="Late" stroke="#FFB86B" strokeWidth={2} fill="url(#lateGrad)" />
              <Area type="monotone" dataKey="onLeave" name="On leave" stroke="#7C5CFF" strokeWidth={1.5} fillOpacity={0} strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader title="Needs your decision" subtitle="Pending across modules" icon={AlertTriangle} />
          <div className="grid grid-cols-2 gap-2 p-4">
            <Link to="/app/leave" className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-violet/40">
              <p className="font-display text-2xl font-semibold">{k.pendingLeave}</p>
              <p className="text-[12px] text-text-muted">Leave requests</p>
            </Link>
            <Link to="/app/attendance" className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-violet/40">
              <p className="font-display text-2xl font-semibold">{k.pendingApprovals - k.pendingLeave}</p>
              <p className="text-[12px] text-text-muted">Corrections</p>
            </Link>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="font-display text-2xl font-semibold">{k.missingCheckout}</p>
              <p className="text-[12px] text-text-muted">Missing checkouts</p>
            </div>
            <Link to="/app/payroll" className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-violet/40">
              <p className="font-display text-2xl font-semibold">{k.payroll?.finalized ? 'Locked' : 'Draft'}</p>
              <p className="text-[12px] text-text-muted">Payroll · {k.payroll?.month}</p>
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AiSummaryCard role="hr" />

        <Card>
          <CardHeader title="Top late-comers" subtitle="This month" icon={Clock} />
          <div className="divide-y divide-white/[0.05]">
            {(data.lateComers || []).length ? (
              data.lateComers.map((p) => (
                <div key={p.employee_code} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-text">{p.name}</p>
                    <p className="truncate text-[11px] text-text-faint">{p.department} · {p.employee_code}</p>
                  </div>
                  <Badge tone="amber">{p.lateCount}×</Badge>
                </div>
              ))
            ) : (
              <EmptyState title="Nobody is late" description="A clean month so far." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="On leave today" subtitle={dateLabel(data.today.date)} icon={CalendarDays} />
          <div className="divide-y divide-white/[0.05]">
            {(data.onLeaveToday || []).length ? (
              data.onLeaveToday.map((p) => (
                <div key={`${p.name}-${p.type}`} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-text">{p.name}</p>
                    <p className="truncate text-[11px] text-text-faint">{p.department || '—'}</p>
                  </div>
                  <Badge tone={p.isPaid ? 'violet' : 'amber'}>{p.type}</Badge>
                </div>
              ))
            ) : (
              <EmptyState title="Everyone is in" description="No approved leave covers today." />
            )}
          </div>
        </Card>
      </div>

      <ChartCard title="Attendance by department" subtitle="This month" icon={Users} height={260}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.departmentAttendance} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#6B7488', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6B7488', fontSize: 11 }} axisLine={false} tickLine={false} width={34} unit="%" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'Attendance']} />
            <Bar dataKey="attendanceRate" name="Attendance" radius={[6, 6, 0, 0]} fill="#7C5CFF" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

/* -------------------------------- admin view ------------------------------ */

function AdminDashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/analytics/dashboard') });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;

  const k = data.kpis;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company overview"
        title="Admin dashboard"
        description="Headcount, cost and the audit trail — computed on the server, always matching the records."
        actions={
          <>
            <Button as={Link} to="/app/payroll" size="sm" variant="secondary" icon={Wallet}>Payroll</Button>
            <Button as={Link} to="/app/audit" size="sm" icon={ArrowRight}>Audit log</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Headcount" value={number(k.headcount)} hint={`${k.probations} on probation`} icon={Users} tone="violet" />
        <StatCard label="Attrition (YTD)" value={pct(k.attrition, 1)} hint={`${k.exits} exit(s)`} icon={TrendingUp} tone="rose" />
        <StatCard label="Payroll cost" value={PKR(k.payroll?.net || 0, { compact: true })} hint={`${k.payroll?.month || ''} · ${k.payroll?.finalized ? 'finalized' : 'draft'}`} icon={Wallet} tone="mint" />
        <StatCard label="Average salary" value={PKR(k.avgSalary, { compact: true })} hint="gross, active staff" icon={UserRound} tone="cyan" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <ChartCard title="Headcount by department" subtitle="Active + probation" icon={Users} height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.headcountByDepartment} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#6B7488', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7488', fontSize: 11 }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="headcount" name="People" radius={[6, 6, 0, 0]} fill="#22D3EE" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Payroll by month" subtitle="Gross vs net" icon={Wallet} height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...(data.payrollByMonth || [])].reverse()} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#6B7488', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6B7488', fontSize: 11 }} axisLine={false} tickLine={false} width={46} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => PKR(v)} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9AA3B8' }} />
              <Bar dataKey="gross" name="Gross" radius={[5, 5, 0, 0]} fill="#7C5CFF" />
              <Bar dataKey="net" name="Net" radius={[5, 5, 0, 0]} fill="#3DDC97" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AiSummaryCard role="admin" />

        <Card>
          <CardHeader title="Gender mix" icon={Users} />
          <div className="p-3" style={{ height: 210 }}>
            {(data.genderSplit || []).length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.genderSplit} dataKey="count" nameKey="gender" innerRadius={45} outerRadius={72} paddingAngle={3} stroke="none">
                    {data.genderSplit.map((entry, i) => <Cell key={entry.gender} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9AA3B8' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No data yet" description="Add employees to see the mix." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Tenure" icon={Clock} />
          <div className="p-4" style={{ height: 210 }}>
            {(data.tenure || []).length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.tenure} layout="vertical" margin={{ left: -24, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="label" tick={{ fill: '#9AA3B8', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="People" radius={[0, 6, 6, 0]} fill="#FFB86B" barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No data yet" />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Audit feed" subtitle="Latest actions across the company" icon={AlertTriangle} action={<Button as={Link} to="/app/audit" size="sm" variant="ghost" icon={ArrowUpRight}>Open log</Button>} />
        <ul className="divide-y divide-white/[0.05]">
          {(data.auditFeed || []).length ? (
            data.auditFeed.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[12.5px]">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-faint">{a.action}</span>
                <span className="text-text-muted">{a.summary || a.entity}</span>
                <span className="ml-auto text-[11px] text-text-faint">{a.actorName} · {timeLabel(a.createdAt)}</span>
              </li>
            ))
          ) : (
            <EmptyState title="Nothing logged yet" description="Every create, update, approval and finalize lands here." />
          )}
        </ul>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { role } = useAuth();
  if (role === 'employee') return <EmployeeDashboard />;
  if (role === 'admin') return <AdminDashboard />;
  return <HrDashboard />;
}
