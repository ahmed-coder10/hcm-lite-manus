import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Banknote,
  Building2,
  CalendarDays,
  CalendarOff,
  Clock,
  Gauge,
  Inbox,
  ListChecks,
  Plane,
  Sparkles,
  TrendingDown,
  UserCheck,
  Users,
  Wallet,
  Wand2,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  Td,
  Th,
  Tr,
  cn,
} from '../../components/ui';
import { get, post } from '../../lib/api';
import {
  PKR,
  currentMonth,
  dateFromKey,
  dateLabel,
  monthLabel,
  number,
  pct,
  relativeTime,
  todayKey,
} from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

/* --------------------------------- helpers -------------------------------- */

const PALETTE = ['#7C5CFF', '#22D3EE', '#3DDC97', '#FFB86B', '#FF6B8A'];
const AXIS = { fill: '#9AA3B8', fontSize: 11 };
const GRID = 'rgba(255,255,255,0.06)';
const CURSOR = { fill: 'rgba(255,255,255,0.04)' };

const PRESETS = [
  { id: 'month', label: 'This month' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
];

const localKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const shiftDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localKey(d);
};

const presetRange = (id) => {
  if (id === '30') return { from: shiftDays(-29), to: todayKey() };
  if (id === '90') return { from: shiftDays(-89), to: todayKey() };
  return { from: `${currentMonth()}-01`, to: todayKey() };
};

const shortName = (value) => {
  const text = String(value ?? '');
  return text.length > 16 ? `${text.slice(0, 15)}…` : text;
};

const rateColor = (rate) => {
  if (rate == null) return '#6B7488';
  if (rate >= 90) return '#3DDC97';
  if (rate >= 75) return '#22D3EE';
  if (rate >= 60) return '#FFB86B';
  return '#FF6B8A';
};

/* ------------------------------- chart pieces ------------------------------ */

function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/95 px-3 py-2 shadow-card">
      {label != null ? (
        <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-faint">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      ) : null}
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2 text-[12px] text-text-muted">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: entry.color || entry.payload?.color || entry.payload?.fill || PALETTE[0] }}
              aria-hidden="true"
            />
            <span className="mr-3">{entry.name}</span>
            <span className="ml-auto font-mono text-text">
              {valueFormatter ? valueFormatter(entry.value, entry) : number(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Compact table that doubles as the accessible alternative for a chart. */
function MiniTable({ caption, head, rows, className, wide = false }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className={cn('w-full border-collapse text-left', wide && 'min-w-[440px]')}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <Th key={cell}>{cell}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <Tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <Td key={cellIndex}>{cell}</Td>
              ))}
            </Tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListRow({ children }) {
  return <li className="flex items-center gap-3 border-b border-white/[0.05] px-4 py-3 last:border-0">{children}</li>;
}

/* ---------------------------------- page ---------------------------------- */

export default function Analytics() {
  const { role } = useAuth();
  const toast = useToast();

  const [preset, setPreset] = useState('month');
  const [draft, setDraft] = useState(() => ({ ...presetRange('month'), departmentId: '' }));
  const [applied, setApplied] = useState(() => ({ ...presetRange('month'), departmentId: '' }));
  const [ai, setAi] = useState(null);

  const departmentsQuery = useQuery({
    queryKey: ['org', 'departments'],
    queryFn: () => get('/org/departments'),
    staleTime: 5 * 60_000,
  });
  const departments = Array.isArray(departmentsQuery.data) ? departmentsQuery.data : [];

  const dashboardQuery = useQuery({
    queryKey: ['analytics', 'dashboard', applied.from, applied.to, applied.departmentId],
    queryFn: () => {
      const params = new URLSearchParams({ from: applied.from, to: applied.to });
      if (applied.departmentId) params.set('departmentId', applied.departmentId);
      return get(`/analytics/dashboard?${params.toString()}`);
    },
  });

  useEffect(() => {
    setAi(null);
  }, [applied.from, applied.to, applied.departmentId]);

  const summarize = useMutation({
    mutationFn: () => post('/ai/summary', {}),
    onSuccess: (response) => {
      if (Array.isArray(response?.insights) && response.insights.length) {
        setAi({ insights: response.insights, generated: Boolean(response.aiGenerated) });
      }
      if (response?.aiGenerated) {
        toast.success('AI summary ready', 'The bullets below were rewritten by the AI from this dashboard.');
      } else {
        toast.info('Summary refreshed', 'No AI provider is configured, so these insights come from the local rules engine.');
      }
    },
    onError: (err) => toast.error('Could not summarize', err.message),
  });

  const data = dashboardQuery.data;
  const effectiveRole = data?.role || role;
  const isAdmin = effectiveRole === 'admin';
  const isHr = effectiveRole === 'hr';
  const kpis = data?.kpis || {};

  const dirty = draft.from !== applied.from || draft.to !== applied.to || draft.departmentId !== applied.departmentId;
  const selectedDepartment = departments.find((d) => d.id === applied.departmentId);
  const rangeLabel = `${dateLabel(dateFromKey(applied.from), { withYear: false })} → ${dateLabel(dateFromKey(applied.to))}`;

  const choosePreset = (id) => {
    const range = presetRange(id);
    setPreset(id);
    setDraft((prev) => ({ ...prev, from: range.from, to: range.to }));
    setApplied((prev) => ({ ...prev, from: range.from, to: range.to }));
  };

  const applyFilters = () => {
    if (!draft.from || !draft.to) {
      toast.error('Pick a date range', 'Both a start and an end date are required.');
      return;
    }
    if (draft.from > draft.to) {
      toast.error('Range is backwards', 'The start date must be on or before the end date.');
      return;
    }
    setApplied({ from: draft.from, to: draft.to, departmentId: draft.departmentId });
  };

  const trend = data?.trend || [];
  const deptRows = (data?.departmentAttendance || []).filter((row) => row.attendanceRate != null || row.headcount != null);
  const leaveTypes = (data?.leave?.byType || []).map((type, index) => ({
    ...type,
    color: type.color || PALETTE[index % PALETTE.length],
    days: Number(type.days) || 0,
  }));
  const leaveWithDays = leaveTypes.filter((type) => type.days > 0);
  const leaveTotal = leaveTypes.reduce((sum, type) => sum + type.days, 0);
  const headcountRows = useMemo(() => data?.headcountByDepartment || [], [data]);
  const payrollRows = useMemo(
    () => [...(data?.payrollByMonth || [])].reverse(),
    [data],
  );

  const insights = ai?.insights || data?.insights || [];

  const hrKpis = [
    {
      label: 'Headcount',
      value: number(kpis.headcount),
      hint: `${number(kpis.departments)} department(s)`,
      icon: Users,
      tone: 'violet',
    },
    {
      label: 'Present today',
      value: number(kpis.presentToday),
      hint: data?.today
        ? `${dateLabel(data.today.date, { withYear: false })}${data.today.weekend ? ' · weekend' : ''}${data.today.holiday ? ' · holiday' : ''}`
        : 'Today',
      icon: UserCheck,
      tone: 'mint',
    },
    {
      label: 'Late today',
      value: number(kpis.lateToday),
      hint: `${number(kpis.lateTotal)} late in range`,
      icon: Clock,
      tone: 'amber',
    },
    {
      label: 'On leave today',
      value: number(kpis.onLeaveToday),
      hint: `${number(kpis.pendingLeave)} request(s) pending`,
      icon: CalendarOff,
      tone: 'cyan',
    },
    {
      label: 'Pending approvals',
      value: number(kpis.pendingApprovals),
      hint: 'Leave + corrections',
      icon: Inbox,
      tone: 'rose',
    },
    {
      label: 'Attendance rate',
      value: pct(kpis.attendanceRate),
      hint: `${pct(kpis.leaveUtilization)} leave used`,
      icon: Gauge,
      tone: 'violet',
    },
  ];

  const adminKpis = [
    {
      label: 'Headcount',
      value: number(kpis.headcount),
      hint: `${number(kpis.probations)} on probation`,
      icon: Users,
      tone: 'violet',
    },
    {
      label: 'Attrition',
      value: pct(kpis.attrition),
      hint: `${number(kpis.exits)} exit(s) in period`,
      icon: TrendingDown,
      tone: 'rose',
    },
    {
      label: 'Payroll net',
      value: PKR(kpis.payroll?.net, { compact: true }),
      hint: `${monthLabel(kpis.payroll?.month)} · ${kpis.payroll?.finalized ? 'finalized' : 'draft'}`,
      icon: Wallet,
      tone: 'mint',
    },
    {
      label: 'Average salary',
      value: PKR(kpis.avgSalary, { compact: true }),
      hint: 'Gross per employee',
      icon: Banknote,
      tone: 'cyan',
    },
    {
      label: 'Attendance rate',
      value: pct(kpis.attendanceRate),
      hint: 'For this range',
      icon: Gauge,
      tone: 'amber',
    },
    {
      label: 'Departments',
      value: number(kpis.departments),
      hint: 'Active departments',
      icon: Building2,
      tone: 'violet',
    },
  ];

  const kpiCards = isAdmin ? adminKpis : hrKpis;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title={isAdmin ? 'Company analytics' : 'People analytics'}
        description="Attendance, leave and payroll signals for the period you choose. Every chart has a table underneath it."
      />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Date range presets">
              {PRESETS.map((option) => (
                <Button
                  key={option.id}
                  size="md"
                  variant={preset === option.id ? 'primary' : 'secondary'}
                  aria-pressed={preset === option.id}
                  onClick={() => choosePreset(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <span className="mx-1 hidden h-8 w-px bg-white/10 sm:block" aria-hidden="true" />
            <Field label="From" className="w-[152px]">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(event) => {
                    setPreset('custom');
                    setDraft((prev) => ({ ...prev, from: event.target.value }));
                  }}
                />
              )}
            </Field>
            <Field label="To" className="w-[152px]">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(event) => {
                    setPreset('custom');
                    setDraft((prev) => ({ ...prev, to: event.target.value }));
                  }}
                />
              )}
            </Field>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Department" className="w-[200px]">
              {(props) => (
                <Select
                  {...props}
                  value={draft.departmentId}
                  onChange={(event) => setDraft((prev) => ({ ...prev, departmentId: event.target.value }))}
                >
                  <option value="">All departments</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button icon={CalendarDays} loading={dashboardQuery.isFetching} onClick={applyFilters}>
              Apply
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/[0.06] pt-3 text-[12.5px] text-text-muted">
          <span className="label-mono">Resolved range</span>
          <span className="font-mono text-[11.5px] text-text">{rangeLabel}</span>
          {selectedDepartment ? (
            <Badge tone="violet">{selectedDepartment.name}</Badge>
          ) : (
            <Badge tone="faint">All departments</Badge>
          )}
          {dirty ? <span className="text-amber">Filters changed — press Apply to refresh.</span> : null}
        </div>
      </Card>

      {dashboardQuery.isLoading ? (
        <div className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-[372px] rounded-2xl lg:col-span-2" />
            <Skeleton className="h-[372px] rounded-2xl" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[360px] rounded-2xl" />
            <Skeleton className="h-[360px] rounded-2xl" />
          </div>
          <span className="sr-only">Loading analytics…</span>
        </div>
      ) : dashboardQuery.isError ? (
        <Card>
          <ErrorState message={dashboardQuery.error?.message} onRetry={() => dashboardQuery.refetch()} />
        </Card>
      ) : !data ? (
        <Card>
          <EmptyState
            icon={Gauge}
            title="No analytics to show"
            description="The dashboard returned no data for this range. Try a wider date range."
          />
        </Card>
      ) : Number(kpis.headcount) === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No employees yet"
            description="Add employees to see analytics."
            action={
              <Button as={Link} to="/app/employees" variant="secondary">
                Go to employees
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpiCards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                hint={card.hint}
                icon={card.icon}
                tone={card.tone}
              />
            ))}
          </div>

          {/* Trend + AI summary */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                icon={CalendarDays}
                title="Attendance trend"
                subtitle={`Last ${number(trend.length)} days · ${rangeLabel}`}
              />
              <div className="p-4">
                {trend.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No attendance in this range"
                    description="Attendance records will appear here once employees start checking in."
                    className="py-10"
                  />
                ) : (
                  <>
                    <div className="h-[260px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                          <defs>
                            <linearGradient id="trendPresent" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#7C5CFF" stopOpacity={0.45} />
                              <stop offset="95%" stopColor="#7C5CFF" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="trendLate" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#FFB86B" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#FFB86B" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="trendLeave" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#22D3EE" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={AXIS}
                            tickLine={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            minTickGap={18}
                            tickFormatter={(value) => dateLabel(value, { withYear: false })}
                          />
                          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                          <Tooltip
                            content={<ChartTooltip labelFormatter={(value) => dateLabel(value)} />}
                            cursor={{ stroke: 'rgba(255,255,255,0.15)' }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
                          <Area
                            type="monotone"
                            dataKey="present"
                            name="Present"
                            stroke="#7C5CFF"
                            strokeWidth={2}
                            fill="url(#trendPresent)"
                          />
                          <Area
                            type="monotone"
                            dataKey="late"
                            name="Late"
                            stroke="#FFB86B"
                            strokeWidth={2}
                            fill="url(#trendLate)"
                          />
                          <Area
                            type="monotone"
                            dataKey="onLeave"
                            name="On leave"
                            stroke="#22D3EE"
                            strokeWidth={2}
                            fill="url(#trendLeave)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <MiniTable
                      className="sr-only"
                      caption="Attendance trend by day: present, late, half day and on leave"
                      head={['Date', 'Present', 'Late', 'Half day', 'On leave']}
                      rows={trend.map((day) => [
                        dateLabel(day.date),
                        number(day.present),
                        number(day.late),
                        number(day.halfDay),
                        number(day.onLeave),
                      ])}
                    />
                  </>
                )}
              </div>
            </Card>

            <Card className="flex flex-col">
              <CardHeader
                icon={Sparkles}
                title="AI summary"
                subtitle="Bullets built from this dashboard"
                action={
                  <Button
                    variant="secondary"
                    icon={Wand2}
                    loading={summarize.isPending}
                    onClick={() => summarize.mutate()}
                  >
                    Summarize with AI
                  </Button>
                }
              />
              <div className="flex-1 space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {ai?.generated ? (
                    <Badge tone="cyan" dot>
                      AI-generated
                    </Badge>
                  ) : ai ? (
                    <Badge tone="faint">Rules engine</Badge>
                  ) : (
                    <Badge tone="faint">Dashboard rules</Badge>
                  )}
                  <span className="text-[11.5px] text-text-faint">
                    {ai ? (ai.generated ? 'Rewritten from your KPI JSON' : 'Generated locally, no AI key') : 'Server-side insights'}
                  </span>
                </div>

                {insights.length === 0 ? (
                  <p className="text-[13px] text-text-muted">
                    No insights for this range yet. Try a wider period or press “Summarize with AI”.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {insights.map((line, index) => (
                      <li key={`${index}-${line}`} className="flex gap-2.5 text-[13px] leading-relaxed text-text-muted">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden="true" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-[11.5px] leading-relaxed text-text-faint">
                  Numbers always come from your database — the AI only rephrases them.
                </p>
              </div>
            </Card>
          </div>

          {/* Role-specific charts */}
          {isHr ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader
                  icon={Building2}
                  title="Department attendance"
                  subtitle="Attendance rate per department for this range"
                />
                <div className="p-4">
                  {deptRows.length === 0 ? (
                    <EmptyState
                      icon={Building2}
                      title="No departments yet"
                      description="Create departments and assign employees to see the breakdown."
                      className="py-10"
                    />
                  ) : (
                    <>
                      <div className="h-[260px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={deptRows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                            <CartesianGrid stroke={GRID} horizontal={false} />
                            <XAxis
                              type="number"
                              domain={[0, 100]}
                              tick={AXIS}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => `${value}%`}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={120}
                              tick={AXIS}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={shortName}
                            />
                            <Tooltip
                              content={<ChartTooltip valueFormatter={(value) => pct(value)} />}
                              cursor={CURSOR}
                            />
                            <Bar dataKey="attendanceRate" name="Attendance rate" radius={[0, 6, 6, 0]}>
                              {deptRows.map((row) => (
                                <Cell key={row.name} fill={rateColor(row.attendanceRate)} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <MiniTable
                        className="mt-3"
                        wide
                        caption="Attendance rate and headcount by department"
                        head={['Department', 'Headcount', 'Attendance', 'Absent']}
                        rows={deptRows.map((row) => [
                          row.name,
                          number(row.headcount),
                          row.attendanceRate == null ? '—' : pct(row.attendanceRate),
                          number(row.absent),
                        ])}
                      />
                    </>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader
                  icon={Plane}
                  title="Leave mix"
                  subtitle={`Approved leave days · ${pct(data.leave?.utilization)} utilisation · ${number(data.leave?.pending)} pending`}
                />
                <div className="p-4">
                  {leaveWithDays.length === 0 ? (
                    <EmptyState
                      icon={Plane}
                      title="No approved leave"
                      description="Nobody took approved leave in this range, so the mix is empty."
                      className="py-10"
                    />
                  ) : (
                    <>
                      <div className="relative">
                        <div className="h-[260px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={leaveWithDays}
                                dataKey="days"
                                nameKey="name"
                                innerRadius={62}
                                outerRadius={96}
                                paddingAngle={2}
                                stroke="#05060B"
                                strokeWidth={2}
                              >
                                {leaveWithDays.map((type) => (
                                  <Cell key={type.id || type.name} fill={type.color} />
                                ))}
                              </Pie>
                              <Tooltip
                                content={
                                  <ChartTooltip valueFormatter={(value) => `${number(value)} day(s)`} />
                                }
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <p className="font-display text-2xl font-semibold text-text">{number(leaveTotal)}</p>
                          <p className="text-[11px] text-text-faint">leave days</p>
                        </div>
                      </div>
                      <MiniTable
                        className="mt-3"
                        wide
                        caption="Approved leave days and requests by leave type"
                        head={['Leave type', 'Days', 'Requests']}
                        rows={leaveTypes.map((type) => [
                          <span key={type.id || type.name} className="inline-flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: type.color }}
                              aria-hidden="true"
                            />
                            {type.name}
                          </span>,
                          number(type.days),
                          number(type.requests),
                        ])}
                      />
                    </>
                  )}
                </div>
              </Card>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader
                  icon={Wallet}
                  title="Payroll by month"
                  subtitle="Prorated gross vs net take-home"
                />
                <div className="p-4">
                  {payrollRows.length === 0 ? (
                    <EmptyState
                      icon={Wallet}
                      title="No payroll runs yet"
                      description="Generate a payroll month and its gross and net will appear here."
                      className="py-10"
                    />
                  ) : (
                    <>
                      <div className="h-[260px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={payrollRows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                            <CartesianGrid stroke={GRID} vertical={false} />
                            <XAxis
                              dataKey="month"
                              tick={AXIS}
                              tickLine={false}
                              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                              tickFormatter={(value) => monthLabel(value)}
                            />
                            <YAxis
                              tick={AXIS}
                              tickLine={false}
                              axisLine={false}
                              width={56}
                              tickFormatter={(value) => PKR(value, { compact: true }).replace('PKR ', '')}
                            />
                            <Tooltip
                              content={<ChartTooltip valueFormatter={(value) => PKR(value, { compact: true })} />}
                              cursor={CURSOR}
                            />
                            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
                            <Bar dataKey="gross" name="Gross" fill="#7C5CFF" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="net" name="Net" fill="#3DDC97" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <MiniTable
                        wide
                        caption="Payroll gross, net and status by month"
                        head={['Month', 'Status', 'Gross', 'Net']}
                        rows={payrollRows.map((row) => [
                          monthLabel(row.month),
                          <Badge key={row.month} tone={row.status === 'finalized' ? 'mint' : 'amber'} dot>
                            {row.status}
                          </Badge>,
                          PKR(row.gross, { compact: true }),
                          PKR(row.net, { compact: true }),
                        ])}
                      />
                    </>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader
                  icon={Building2}
                  title="Headcount by department"
                  subtitle="Active and probation employees"
                />
                <div className="p-4">
                  {headcountRows.length === 0 ? (
                    <EmptyState
                      icon={Building2}
                      title="No departments yet"
                      description="Create departments and assign employees to see the split."
                      className="py-10"
                    />
                  ) : (
                    <>
                      <div className="h-[260px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={headcountRows}
                            layout="vertical"
                            margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
                          >
                            <CartesianGrid stroke={GRID} horizontal={false} />
                            <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={120}
                              tick={AXIS}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={shortName}
                            />
                            <Tooltip content={<ChartTooltip />} cursor={CURSOR} />
                            <Bar dataKey="headcount" name="Headcount" fill="#22D3EE" radius={[0, 6, 6, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <MiniTable
                        className="mt-3"
                        wide
                        caption="Headcount and payroll cost by department"
                        head={['Department', 'Headcount', 'Payroll gross', 'Payroll net']}
                        rows={headcountRows.map((row) => [
                          row.name,
                          number(row.headcount),
                          PKR(row.payrollGross, { compact: true }),
                          PKR(row.payrollNet, { compact: true }),
                        ])}
                      />
                    </>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Lists */}
          {isHr ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Card>
                <CardHeader
                  icon={Clock}
                  title="Top late-comers"
                  subtitle={`${number(kpis.lateTotal)} late arrival(s) in range`}
                />
                {data.lateComers?.length ? (
                  <ul>
                    {data.lateComers.map((person) => (
                      <ListRow key={`${person.employee_code}-${person.name}`}>
                        <Avatar name={person.name} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-text">{person.name}</p>
                          <p className="truncate text-[11.5px] text-text-faint">
                            {person.employee_code} · {person.department}
                          </p>
                        </div>
                        <Badge tone="amber">{number(person.lateCount)}×</Badge>
                      </ListRow>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={Clock}
                    title="No late arrivals"
                    description="Everyone was on time in this range."
                    className="py-8"
                  />
                )}
              </Card>

              <Card>
                <CardHeader
                  icon={CalendarOff}
                  title="On leave today"
                  subtitle={`${number(data.onLeaveToday?.length || 0)} approved absence(s)`}
                />
                {data.onLeaveToday?.length ? (
                  <ul>
                    {data.onLeaveToday.map((person) => (
                      <ListRow key={`${person.employee_code}-${person.name}`}>
                        <Avatar name={person.name} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-text">{person.name}</p>
                          <p className="truncate text-[11.5px] text-text-faint">
                            {person.employee_code} · {person.department || 'Unassigned'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[11.5px] text-text">{person.type}</span>
                          <Badge tone={person.isPaid ? 'mint' : 'amber'}>{person.isPaid ? 'Paid' : 'Unpaid'}</Badge>
                        </div>
                      </ListRow>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={CalendarOff}
                    title="Nobody is on leave"
                    description="Everyone is expected in today."
                    className="py-8"
                  />
                )}
              </Card>

              <Card>
                <CardHeader icon={UserCheck} title="Recent hires" subtitle="Latest people to join" />
                {data.recentHires?.length ? (
                  <ul>
                    {data.recentHires.map((person) => (
                      <ListRow key={`${person.employee_code}-${person.join_date}`}>
                        <Avatar name={person.name} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-text">{person.name}</p>
                          <p className="truncate text-[11.5px] text-text-faint">{person.employee_code}</p>
                        </div>
                        <span className="text-[11.5px] text-text-muted">{dateLabel(person.join_date)}</span>
                      </ListRow>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={UserCheck}
                    title="No recent hires"
                    description="New employees will show up here."
                    className="py-8"
                  />
                )}
              </Card>
            </div>
          ) : (
            <Card>
              <CardHeader
                icon={ListChecks}
                title="Audit feed"
                subtitle="The latest recorded actions across the company"
              />
              {data.auditFeed?.length ? (
                <ul className="grid gap-0 md:grid-cols-2 md:gap-x-6">
                  {data.auditFeed.map((entry) => (
                    <li key={entry.id} className="border-b border-white/[0.05] px-4 py-3 last:border-0">
                      <p className="text-[13px] text-text">{entry.summary}</p>
                      <p className="mt-0.5 text-[11.5px] text-text-faint">
                        {entry.actorName || 'system'} · {entry.action}
                        {entry.entity ? ` · ${entry.entity}` : ''} · {relativeTime(entry.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={ListChecks}
                  title="Nothing in the audit log"
                  description="Actions are recorded here as your team works."
                  className="py-8"
                />
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
