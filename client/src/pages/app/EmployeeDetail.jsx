import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlarmClock, ArrowLeft, Ban, CalendarCheck, CalendarDays, ChevronDown, Clock3, Hourglass, Landmark,
  Pencil, PhoneCall, SearchX, Timer, UserCheck, UserMinus, Wallet,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Skeleton, StatCard,
  Table, Tabs, Td, Th, Tr, cn,
} from '../../components/ui';
import { EmployeeFormModal } from './Employees';
import { useToast } from '../../context/ToastContext';
import { get, patch } from '../../lib/api';
import {
  PKR, STATUS_TONE, dateLabel, hoursFromMinutes, monthLabel, number, pct, statusLabel, timeLabel, titleCase,
} from '../../lib/format';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'leave', label: 'Leave' },
  { value: 'payroll', label: 'Payroll' },
];

const STATUS_ACTIONS = [
  {
    status: 'active',
    label: 'Activate',
    description: 'Their login is re-enabled and the exit date is cleared.',
    tone: 'success',
    icon: UserCheck,
  },
  {
    status: 'probation',
    label: 'Move to probation',
    description: 'The profile is marked as probation and access is enabled.',
    tone: 'primary',
    icon: Clock3,
  },
  {
    status: 'resigned',
    label: 'Mark resigned',
    description: 'Their login is disabled and today becomes the exit date.',
    tone: 'danger',
    icon: UserMinus,
  },
  {
    status: 'terminated',
    label: 'Terminate',
    description: 'Access is revoked immediately and today becomes the exit date.',
    tone: 'danger',
    icon: Ban,
  },
];

const EMPLOYMENT_LABELS = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'Contract',
  intern: 'Intern',
};

const GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  undisclosed: 'Prefer not to say',
};

const employmentLabel = (value) => EMPLOYMENT_LABELS[value] || titleCase(value || '—');
const genderLabel = (value) => GENDER_LABELS[value] || titleCase(value || '—');

const confirmTitle = (action, name) => {
  if (action.status === 'active') return `Activate ${name}?`;
  if (action.status === 'probation') return `Move ${name} to probation?`;
  if (action.status === 'resigned') return `Mark ${name} as resigned?`;
  return `Terminate ${name}?`;
};

/* -------------------------------------------------------------------------- */
/*                              Small building blocks                         */
/* -------------------------------------------------------------------------- */

function DetailItem({ label, value, className }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className={className}>
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-faint">{label}</dt>
      <dd className={cn('mt-1 break-words text-[13.5px] text-text', empty && 'text-text-faint')}>
        {empty ? '—' : value}
      </dd>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <dt className="text-text-faint">{label}</dt>
      <dd className="text-right text-text-muted">{value || '—'}</dd>
    </div>
  );
}

function BankRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[12px] text-text-faint">{label}</span>
      <span className={cn('break-all text-right text-[12.5px] text-text-muted', mono && 'font-mono tracking-[0.03em]')}>
        {value || '—'}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Tabs                                    */
/* -------------------------------------------------------------------------- */

function OverviewTab({ employee }) {
  const emergency = employee.emergencyContact || {};
  const hasEmergency = Boolean(emergency.name || emergency.phone || emergency.relation);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-text-faint">
          Personal details
        </h3>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailItem label="Email" value={employee.email} />
          <DetailItem label="Phone" value={employee.phone} />
          <DetailItem label="City" value={employee.city} />
          <DetailItem label="Gender" value={genderLabel(employee.gender)} />
          <DetailItem label="Join date" value={dateLabel(employee.joinDate)} />
          <DetailItem label="Employment type" value={employmentLabel(employee.employmentType)} />
          <DetailItem label="CNIC" value={employee.cnic} />
          <DetailItem label="Manager" value={employee.managerName} />
          <DetailItem label="Address" value={employee.address} className="sm:col-span-2" />
        </dl>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-text-faint">
            <PhoneCall size={13} aria-hidden="true" />
            Emergency contact
          </h3>
          {hasEmergency ? (
            <dl className="mt-3 space-y-2">
              <DetailRow label="Name" value={emergency.name} />
              <DetailRow label="Phone" value={emergency.phone} />
              <DetailRow label="Relation" value={emergency.relation} />
            </dl>
          ) : (
            <p className="mt-3 text-[12.5px] text-text-faint">No emergency contact on file.</p>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-text-faint">Notes</h3>
          <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-text-muted">
            {employee.notes || 'No notes yet.'}
          </p>
        </section>
      </div>
    </div>
  );
}

function AttendanceTab({ rows }) {
  if (!rows?.length) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No attendance yet"
        description="Check-ins and check-outs will appear here once this employee starts recording time."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-text-muted">The last 10 attendance records, newest first.</p>
      <Table caption="Recent attendance">
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Status</Th>
            <Th>Check in</Th>
            <Th>Check out</Th>
            <Th>Hours</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Tr key={row.date}>
              <Td className="whitespace-nowrap text-text">{dateLabel(row.date, { weekday: true })}</Td>
              <Td>
                <Badge tone={STATUS_TONE[row.status] || 'neutral'} dot>
                  {statusLabel(row.status)}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap">{timeLabel(row.checkInAt)}</Td>
              <Td className="whitespace-nowrap">{timeLabel(row.checkOutAt)}</Td>
              <Td className="whitespace-nowrap">{hoursFromMinutes(row.workedMinutes)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function LeaveTab({ balances }) {
  if (!balances?.length) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No leave balances yet"
        description="Leave types configured in Settings will show up here with this year's usage."
      />
    );
  }

  return (
    <div className="space-y-5">
      {balances.map((balance) => {
        const unlimited = balance.allocated == null;
        const allocated = Number(balance.allocated) || 0;
        const used = Number(balance.used) || 0;
        const remaining = balance.remaining == null ? Math.max(0, allocated - used) : balance.remaining;
        const usage = unlimited ? 100 : Math.min(100, Math.round((used / Math.max(1, allocated)) * 100));
        const color = balance.color || '#7C5CFF';

        return (
          <div key={balance.leaveTypeId}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <p className="text-[13.5px] text-text">{balance.name}</p>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint">
                  {balance.code}
                </span>
              </div>
              <p className="text-[12px] text-text-muted">
                {unlimited ? 'Unlimited allocation' : `${remaining} of ${allocated} days left`}
              </p>
            </div>

            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={unlimited ? 100 : usage}
              aria-label={`${balance.name} used`}
            >
              <div
                className={cn('h-full rounded-full transition-[width] duration-500', unlimited && 'opacity-30')}
                style={{ width: `${usage}%`, backgroundColor: color }}
              />
            </div>

            <p className="mt-1.5 text-[11.5px] text-text-faint">
              {used} day{used === 1 ? '' : 's'} used this year
              {unlimited ? ' · No annual cap' : ` · ${allocated} allocated`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function PayrollTab({ payslip }) {
  if (!payslip) {
    return (
      <EmptyState
        icon={Wallet}
        title="No finalized payslip yet"
        description="Once a payroll run is finalized for this employee, the latest payslip will appear here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-mono">Latest payslip</p>
          <p className="mt-1 font-display text-xl font-semibold tracking-tight text-text">
            {monthLabel(payslip.month)}
          </p>
          <div className="mt-2">
            <Badge tone={STATUS_TONE[payslip.status] || 'neutral'} dot>
              {statusLabel(payslip.status)}
            </Badge>
          </div>
        </div>
        <span className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-cyan">
          <Wallet size={18} aria-hidden="true" />
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-faint">Gross pay</p>
          <p className="mt-1 font-display text-lg font-semibold text-text">{PKR(payslip.gross)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-faint">Net pay</p>
          <p className="mt-1 font-display text-lg font-semibold text-mint">{PKR(payslip.net)}</p>
        </div>
      </div>

      <p className="text-[12px] leading-relaxed text-text-faint">
        Only the most recent payslip is shown here. Full payroll history lives in the Payroll module.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Salary card                                 */
/* -------------------------------------------------------------------------- */

function SalaryCard({ salary }) {
  if (!salary) return null;

  const rentPct = salary.houseRentPct == null ? 40 : salary.houseRentPct;
  const medicalPct = salary.medicalPct == null ? 10 : salary.medicalPct;

  const rows = [
    { label: 'Basic', value: PKR(salary.basic) },
    { label: `House rent / HRA (${pct(rentPct)})`, value: PKR(salary.hra) },
    { label: `Medical (${pct(medicalPct)})`, value: PKR(salary.medical) },
    { label: 'Other allowances', value: PKR(salary.otherAllowances) },
  ];

  return (
    <Card className="overflow-hidden lg:sticky lg:top-20">
      <CardHeader title="Salary" subtitle="Monthly gross breakdown" icon={Wallet} />
      <div className="space-y-3 p-5">
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-[12.5px] text-text-muted">{row.label}</span>
              <span className="text-[13px] text-text">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] pt-3">
          <span className="text-[12.5px] font-medium text-text-muted">Gross</span>
          <span className="font-display text-xl font-semibold text-text">{PKR(salary.gross)}</span>
        </div>

        <p className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11.5px] leading-relaxed text-text-faint">
          Gross = 1.5 × basic
        </p>

        <div className="border-t border-white/[0.07] pt-4">
          <div className="mb-2 flex items-center gap-2">
            <Landmark size={14} className="text-text-faint" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint">Bank details</p>
          </div>
          <div className="space-y-2">
            <BankRow label="Bank" value={salary.bankName} />
            <BankRow label="Account title" value={salary.accountTitle} />
            <BankRow label="Account number" value={salary.accountNumber} mono />
          </div>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Skeleton                                   */
/* -------------------------------------------------------------------------- */

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading employee">
      <Skeleton className="h-10 w-40" />
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Skeleton className="h-[72px] w-[72px] rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-5 w-40 rounded-full" />
          </div>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();

  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const menuRef = useRef(null);

  const query = useQuery({
    queryKey: ['employee', id],
    queryFn: () => get(`/employees/${id}`),
    enabled: Boolean(id),
    retry: (failureCount, err) => err?.status !== 404 && failureCount < 1,
    staleTime: 15_000,
  });

  const statusMutation = useMutation({
    mutationFn: (status) => patch(`/employees/${id}/status`, { status }),
    onSuccess: (updated, status) => {
      toast.success('Status updated', `${updated.fullName} is now ${statusLabel(status).toLowerCase()}.`);
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee-options'] });
      setPending(null);
    },
    onError: (err) => toast.error('Could not update status', err.message),
  });

  useEffect(() => {
    if (!statusOpen) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setStatusOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setStatusOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [statusOpen]);

  useEffect(() => {
    setTab('overview');
    setEditing(false);
    setStatusOpen(false);
    setPending(null);
  }, [id]);

  const backToDirectory = () => navigate('/app/employees');
  const closeEditing = useCallback(() => setEditing(false), []);

  if (query.isLoading) return <DetailSkeleton />;

  if (query.isError && query.error?.status === 404) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="!h-10" icon={ArrowLeft} onClick={backToDirectory}>
          Back to employees
        </Button>
        <Card>
          <EmptyState
            icon={SearchX}
            title="Employee not found"
            description="This profile may have been removed, or the link is incorrect."
            action={
              <Button onClick={backToDirectory} icon={ArrowLeft}>
                Back to employees
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="!h-10" icon={ArrowLeft} onClick={backToDirectory}>
          Back to employees
        </Button>
        <Card>
          <ErrorState message={query.error?.message} onRetry={() => query.refetch()} />
        </Card>
      </div>
    );
  }

  const { employee, attendance, leaveBalances, recentAttendance, lastPayslip } = query.data || {};

  if (!employee) {
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title="Employee not found"
          description="This profile may have been removed, or the link is incorrect."
          action={
            <Button onClick={backToDirectory} icon={ArrowLeft}>
              Back to employees
            </Button>
          }
        />
      </Card>
    );
  }

  const availableStatusActions = STATUS_ACTIONS.filter((action) => {
    if (action.status === employee.status) return false;
    if (action.status === 'resigned' || action.status === 'terminated') {
      return employee.status === 'active' || employee.status === 'probation';
    }
    return true;
  });

  const stats = [
    { label: 'Present this month', value: number(attendance?.present), icon: CalendarCheck, tone: 'mint' },
    { label: 'Late', value: number(attendance?.late), icon: AlarmClock, tone: 'amber' },
    { label: 'Half days', value: number(attendance?.halfDay), icon: Hourglass, tone: 'cyan' },
    { label: 'Hours logged', value: hoursFromMinutes(attendance?.totalMinutes), icon: Timer, tone: 'violet' },
    { label: 'Working days', value: number(attendance?.workingDays), icon: CalendarDays, tone: 'cyan' },
  ];

  return (
    <motion.div
      className="space-y-6"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
    >
      <Button variant="ghost" size="sm" className="!h-10" icon={ArrowLeft} onClick={backToDirectory}>
        Back to employees
      </Button>

      <Card className="relative p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet/10 blur-2xl" />
        </div>
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar name={employee.fullName} size={72} src={employee.photoUrl || undefined} />
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint">
                {employee.employeeCode}
              </p>
              <h1 className="mt-1 break-words font-display text-2xl font-semibold tracking-tight text-text sm:text-[28px]">
                {employee.fullName}
              </h1>
              <p className="mt-1 text-[13.5px] text-text-muted">
                {employee.designationTitle || 'No designation'}
                <span className="mx-1.5 text-text-faint">·</span>
                {employee.departmentName || 'Unassigned department'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[employee.status] || 'neutral'} dot>
                  {statusLabel(employee.status)}
                </Badge>
                <Badge tone="neutral">{employmentLabel(employee.employmentType)}</Badge>
                <span className="text-[12px] text-text-faint">Joined {dateLabel(employee.joinDate)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <div className="relative" ref={menuRef}>
              <Button
                variant="secondary"
                aria-label="Change employee status"
                aria-haspopup="menu"
                aria-expanded={statusOpen}
                onClick={() => setStatusOpen((value) => !value)}
              >
                Status
                <ChevronDown
                  size={15}
                  aria-hidden="true"
                  className={cn('transition-transform duration-150', statusOpen && 'rotate-180')}
                />
              </Button>

              {statusOpen ? (
                <div
                  role="menu"
                  aria-label="Change employee status"
                  className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl glass-strong p-1 shadow-card"
                >
                  {availableStatusActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.status}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setStatusOpen(false);
                          setPending(action);
                        }}
                        className={cn(
                          'flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[13px] transition-colors',
                          action.status === 'active'
                            ? 'text-mint hover:bg-mint/10'
                            : action.status === 'probation'
                              ? 'text-text-muted hover:bg-white/[0.05] hover:text-text'
                              : 'text-rose hover:bg-rose/10',
                        )}
                      >
                        <Icon size={15} aria-hidden="true" />
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
            <div className="-mx-1 overflow-x-auto px-1 no-scrollbar">
              <Tabs tabs={TABS} value={tab} onChange={setTab} className="[&_button]:min-h-[40px]" />
            </div>
          </div>
          <div className="p-4 sm:p-5">
            {tab === 'overview' ? <OverviewTab employee={employee} /> : null}
            {tab === 'attendance' ? <AttendanceTab rows={recentAttendance} /> : null}
            {tab === 'leave' ? <LeaveTab balances={leaveBalances} /> : null}
            {tab === 'payroll' ? <PayrollTab payslip={lastPayslip} /> : null}
          </div>
        </Card>

        <div className="space-y-6">
          <SalaryCard salary={employee.salary} />
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={() => pending && statusMutation.mutate(pending.status)}
        title={pending ? confirmTitle(pending, employee.fullName) : 'Change status'}
        description={pending?.description}
        confirmLabel={pending?.label || 'Confirm'}
        tone={pending?.tone || 'danger'}
        loading={statusMutation.isPending}
      />

      <EmployeeFormModal
        open={editing}
        employee={employee}
        onClose={closeEditing}
      />
    </motion.div>
  );
}
