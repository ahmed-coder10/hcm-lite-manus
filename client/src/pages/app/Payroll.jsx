import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Calculator,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Download,
  FilePlus2,
  FileText,
  Info,
  Lock,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  StatCard,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from '../../components/ui';
import { downloadFile, get, post } from '../../lib/api';
import { PKR, STATUS_TONE, currentMonth, dateLabel, monthLabel, number, statusLabel } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const EMPTY_TOTALS = { gross: 0, proratedGross: 0, deductions: 0, tax: 0, net: 0 };

/** Signed money for breakdown rows (deductions use a real minus sign). */
const moneySigned = (value) => {
  const n = Number(value) || 0;
  return n < 0 ? `\u2212${PKR(Math.abs(n))}` : PKR(n);
};

/** Preview items carry `snapshot`; stored run items are already flat. */
const toRow = (item) => ({
  ...item,
  name: item.snapshot?.name || item.employeeName || 'Employee',
  code: item.snapshot?.code || item.employeeCode || '',
  department: item.snapshot?.department || item.department || '',
  designation: item.snapshot?.designation || item.designation || '',
});

/** Normalises the server `breakdown[]` (and falls back to the raw columns). */
function breakdownOf(item) {
  if (item.breakdown?.length) {
    return {
      earnings: item.breakdown.filter((b) => b.type === 'earning'),
      deductions: item.breakdown.filter((b) => b.type === 'deduction'),
      notes: item.breakdown.filter((b) => b.type === 'note' && Number(b.amount) !== 0),
    };
  }
  return {
    earnings: [
      { label: 'Basic salary', type: 'earning', amount: item.basic },
      { label: 'House rent', type: 'earning', amount: item.hra },
      { label: 'Medical', type: 'earning', amount: item.medical },
      ...(item.otherAllowances ? [{ label: 'Other allowances', type: 'earning', amount: item.otherAllowances }] : []),
    ],
    deductions: [
      { label: `Absent ${number(item.absentDays)} day(s)`, type: 'deduction', amount: item.absenceDeduction },
      { label: `Unpaid leave ${number(item.unpaidLeaveDays)} day(s)`, type: 'deduction', amount: item.unpaidDeduction },
      { label: `Half days (${number(item.halfDays)})`, type: 'deduction', amount: item.halfDayDeduction },
      { label: `Late penalty (${number(item.latePenaltyDays)} day(s))`, type: 'deduction', amount: item.latePenaltyDeduction },
      { label: 'Income tax', type: 'deduction', amount: item.tax },
    ].filter((b) => Number(b.amount) > 0),
    notes: [],
  };
}

const toneOf = (status) => STATUS_TONE[status] || 'neutral';

/* ================================ Employee ================================ */

function MyPayslips() {
  const toast = useToast();
  const [downloading, setDownloading] = useState(null);

  const payslipsQuery = useQuery({
    queryKey: ['payroll', 'me', 'payslips'],
    queryFn: () => get('/payroll/me/payslips'),
  });

  const payslips = Array.isArray(payslipsQuery.data) ? payslipsQuery.data : [];

  const download = async (slip) => {
    setDownloading(slip.id);
    try {
      await downloadFile(`/payroll/payslips/${slip.id}.pdf`, `payslip-${slip.month}.pdf`);
    } catch (err) {
      toast.error('Download failed', err.message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payroll"
        title="My payslips"
        description="Your monthly payslips live here. A month appears once HR generates its payroll and an Admin finalizes it."
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={payslipsQuery.isFetching}
            onClick={() => payslipsQuery.refetch()}
          >
            Refresh
          </Button>
        }
      />

      <Card className="flex items-start gap-3 border-cyan/20 bg-cyan/[0.05] p-4">
        <span className="mt-0.5 rounded-lg border border-cyan/25 bg-cyan/10 p-1.5 text-cyan-soft">
          <Info size={15} aria-hidden="true" />
        </span>
        <div>
          <p className="text-[13px] font-medium text-text">Payslips appear after an Admin finalizes the month</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            A finalized month is locked, so its figures never change. If a month is missing, the payroll for it is still a
            draft — your PDF becomes available the moment it is finalized.
          </p>
        </div>
      </Card>

      {payslipsQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[186px] rounded-2xl" />
          ))}
          <span className="sr-only">Loading your payslips…</span>
        </div>
      ) : payslipsQuery.isError ? (
        <Card>
          <ErrorState message={payslipsQuery.error?.message} onRetry={() => payslipsQuery.refetch()} />
        </Card>
      ) : payslips.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title="No payslips yet"
            description="Nothing has been finalized for you so far. Once HR runs payroll and an Admin finalizes it, the payslip shows up here with a PDF download."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {payslips.map((slip) => (
            <Card key={slip.id} hover className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-[15px] font-semibold text-text">{monthLabel(slip.month)}</p>
                  <p className="mt-0.5 text-[12px] text-text-faint">Gross {PKR(slip.gross)}</p>
                </div>
                <Badge tone={toneOf(slip.runStatus)} dot>
                  {statusLabel(slip.runStatus)}
                </Badge>
              </div>

              <div className="mt-4">
                <p className="label-mono">Net pay</p>
                <p className="font-display text-[26px] font-semibold tracking-tight text-mint">{PKR(slip.net)}</p>
              </div>

              <div className="mt-4">
                {slip.runStatus === 'finalized' ? (
                  <Button
                    variant="secondary"
                    icon={Download}
                    loading={downloading === slip.id}
                    onClick={() => download(slip)}
                    className="w-full"
                  >
                    {downloading === slip.id ? 'Preparing…' : 'Download PDF'}
                  </Button>
                ) : (
                  <div className="flex min-h-11 items-center gap-2 rounded-xl border border-amber/25 bg-amber/10 px-3 text-[12px] text-amber">
                    <Lock size={13} aria-hidden="true" />
                    PDF unlocks when an Admin finalizes
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================= Staff ================================= */

function StatusBanner({ month, status, finalizedAt, employeeCount }) {
  if (status === 'finalized') {
    return (
      <Card className="flex items-start gap-3 border-mint/25 bg-mint/[0.05] p-4">
        <span className="mt-0.5 rounded-lg border border-mint/25 bg-mint/10 p-1.5 text-mint">
          <Lock size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium text-text">Finalized — this month is locked</p>
            <Badge tone="mint" dot>
              {statusLabel('finalized')}
            </Badge>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            {finalizedAt ? `Locked on ${dateLabel(finalizedAt)} by an Admin. ` : 'Locked by an Admin. '}
            Figures for {monthLabel(month)} can no longer be regenerated, and {number(employeeCount)} employee payslip(s)
            are downloadable. Generate and Finalize are disabled for this month.
          </p>
        </div>
      </Card>
    );
  }

  if (status === 'draft') {
    return (
      <Card className="flex items-start gap-3 border-amber/25 bg-amber/[0.05] p-4">
        <span className="mt-0.5 rounded-lg border border-amber/25 bg-amber/10 p-1.5 text-amber">
          <FileText size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium text-text">Draft — no payslips issued yet</p>
            <Badge tone="amber" dot>
              {statusLabel('draft')}
            </Badge>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            A draft can be regenerated as often as you like while attendance keeps changing. It is not visible to
            employees until an Admin finalizes it — and finalizing locks {monthLabel(month)} forever.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex items-start gap-3 p-4">
      <span className="mt-0.5 rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-text-faint">
        <Info size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-text">Preview only — nothing saved for {monthLabel(month)} yet</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
          These numbers are computed live from attendance. Generate a draft to store them, then an Admin can finalize
          the month to issue payslips.
        </p>
      </div>
    </Card>
  );
}

function InlineBanner({ banner, onDismiss }) {
  if (!banner) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px]',
        banner.tone === 'amber' ? 'border-amber/30 bg-amber/10 text-amber' : 'border-rose/30 bg-rose/10 text-rose',
      )}
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="flex-1">{banner.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="rounded-md p-0.5 transition hover:bg-white/10"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-[82px] rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className={cn('h-[104px] rounded-2xl', i === 4 && 'col-span-2 lg:col-span-1')} />
        ))}
      </div>
      <Card>
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </Card>
      <span className="sr-only">Loading payroll preview…</span>
    </div>
  );
}

function BreakdownSection({ title, rows, tone }) {
  return (
    <section>
      <h3 className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.1em] text-text-faint">{title}</h3>
      <ul className="rounded-xl border border-white/10 bg-white/[0.02] px-3">
        {rows.length === 0 ? (
          <li className="py-3 text-[12.5px] text-text-faint">Nothing here for this month.</li>
        ) : (
          rows.map((row, i) => (
            <li key={`${row.label}-${i}`} className="flex items-center justify-between gap-3 border-b border-white/[0.05] py-2 last:border-0">
              <span className="text-[12.5px] text-text-muted">{row.label}</span>
              <span className={cn('shrink-0 font-mono text-[12.5px]', tone)}>{moneySigned(row.amount)}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function DetailModal({ item, month, onClose }) {
  if (!item) return null;
  const { earnings, deductions, notes } = breakdownOf(item);
  const attendance = [
    { label: 'Present', value: item.presentDays },
    { label: 'Late', value: item.lateDays },
    { label: 'Absent', value: item.absentDays },
    { label: 'Half days', value: item.halfDays },
    { label: 'Paid leave', value: item.paidLeaveDays },
    { label: 'Unpaid leave', value: item.unpaidLeaveDays },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={item.name}
      description={[item.code, item.department || 'Unassigned', item.designation, monthLabel(month)]
        .filter(Boolean)
        .join(' · ')}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <Avatar name={item.name} size={42} />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-text">{item.name}</p>
            <p className="truncate text-[12px] text-text-muted">
              {item.eligibleDays} of {item.workingDays} working days · {monthLabel(month)}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="label-mono">Net pay</p>
            <p className="font-display text-lg font-semibold text-mint">{PKR(item.net)}</p>
          </div>
        </div>

        <div className="rounded-xl border border-violet/25 bg-violet/[0.06] p-3.5">
          <p className="flex items-center gap-2 text-[12.5px] font-medium text-text">
            <Calculator size={14} className="text-violet-soft" aria-hidden="true" />
            How the gross is prorated
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            Gross ÷ working days = per-day rate. {PKR(item.gross)} ÷ {number(item.workingDays)} working days ={' '}
            <span className="font-mono text-text">{PKR(item.perDay)}</span> per day. This person was eligible for{' '}
            {number(item.eligibleDays)} of {number(item.workingDays)} working days, so the prorated gross is{' '}
            {PKR(item.proratedGross)}.
          </p>
          <ul className="mt-2.5 space-y-1 font-mono text-[11.5px] text-text-faint">
            <li>
              {PKR(item.gross)} ÷ {number(item.workingDays)} = {PKR(item.perDay)} / day
            </li>
            <li>
              ≈ {PKR(item.perDay)} × {number(item.eligibleDays)} eligible days = {PKR(item.proratedGross)}
            </li>
            <li>
              {PKR(item.proratedGross)} − {PKR(item.totalDeductions)} deductions − {PKR(item.tax)} tax ={' '}
              {PKR(item.net)} net
            </li>
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <BreakdownSection title="Earnings" rows={earnings} tone="text-text" />
          <BreakdownSection title="Deductions" rows={deductions} tone="text-rose" />
        </div>

        {notes.length ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-1">
            {notes.map((note, i) => (
              <div key={`${note.label}-${i}`} className="flex items-center justify-between gap-3 py-2">
                <span className="text-[12.5px] text-text-faint">{note.label}</span>
                <span className="shrink-0 font-mono text-[12.5px] text-text-faint">{moneySigned(note.amount)}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.1em] text-text-faint">
            Attendance used for {monthLabel(month)}
          </h3>
          <div className="flex flex-wrap gap-2">
            {attendance.map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-text-muted"
              >
                {chip.label}
                <span className="font-mono text-text">{number(chip.value)}</span>
              </span>
            ))}
            {item.latePenaltyDays ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/25 bg-amber/10 px-2.5 py-1 text-[11.5px] text-amber">
                Late penalty days <span className="font-mono">{number(item.latePenaltyDays)}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PayrollManagement() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const toast = useToast();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(() => currentMonth());
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [banner, setBanner] = useState(null);
  const [csvLoading, setCsvLoading] = useState(null);

  const previewQuery = useQuery({
    queryKey: ['payroll', 'preview', month],
    queryFn: () => get(`/payroll/preview?month=${month}`),
    enabled: /^\d{4}-\d{2}$/.test(month),
  });

  const runsQuery = useQuery({
    queryKey: ['payroll', 'runs'],
    queryFn: () => get('/payroll/runs'),
  });

  const preview = previewQuery.data;
  const existingRun = preview?.existingRun || null;
  const locked = existingRun?.status === 'finalized';

  // A finalized month always shows the stored (locked) figures, never a recompute.
  const autoRunId = locked ? existingRun.id : null;
  const activeRunId = selectedRunId || autoRunId;
  const runQuery = useQuery({
    queryKey: ['payroll', 'run', activeRunId],
    queryFn: () => get(`/payroll/runs/${activeRunId}`),
    enabled: Boolean(activeRunId),
  });

  const viewedRun = runQuery.data && runQuery.data.month === month ? runQuery.data : null;
  const sourceItems = viewedRun?.items ?? preview?.items ?? [];
  const items = sourceItems.map(toRow);
  const totals = viewedRun?.totals ?? preview?.totals ?? EMPTY_TOTALS;
  const status = viewedRun?.status || existingRun?.status || null;
  const exportId = viewedRun?.id || existingRun?.id || null;
  const finalizeTargetId = selectedRunId || existingRun?.id || null;

  const runs = Array.isArray(runsQuery.data) ? runsQuery.data : [];

  const canGenerate = Boolean(month) && !locked && items.length > 0;
  const canFinalize = isAdmin && !locked && items.length > 0 && Boolean(finalizeTargetId);

  const generateTitle = locked
    ? 'This month is finalized — payroll can no longer be regenerated.'
    : !items.length
      ? 'There are no employees to include for this month.'
      : 'Create or refresh the draft for this month.';

  const finalizeTitle = !isAdmin
    ? 'Only an Admin can finalize payroll.'
    : locked
      ? 'This month is already finalized.'
      : !finalizeTargetId
        ? 'Generate a draft first.'
        : items.length === 0
          ? 'There is nothing to finalize.'
          : 'Locks the month forever and issues payslips.';

  const reportFailure = (title, err) => {
    setBanner({ tone: 'rose', message: err.message });
    toast.error(title, err.message);
  };

  const generate = useMutation({
    mutationFn: () => post('/payroll/runs', { month }),
    onSuccess: (run) => {
      setBanner(null);
      setSelectedRunId(null);
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast.success(
        'Draft generated',
        `${monthLabel(run?.month || month)} saved as a draft for ${number(run?.employeeCount ?? items.length)} employee(s).`,
      );
    },
    onError: (err) =>
      reportFailure(
        err.status === 409 ? 'This month is locked' : err.status === 422 ? 'Cannot generate payroll' : 'Could not generate payroll',
        err,
      ),
  });

  const finalize = useMutation({
    mutationFn: () => post(`/payroll/runs/${finalizeTargetId}/finalize`),
    onSuccess: (run) => {
      setConfirmOpen(false);
      setBanner(null);
      setSelectedRunId(null);
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      toast.success(
        'Payroll finalized',
        `${monthLabel(run?.month || month)} is locked. Payslips are now available to employees.`,
      );
    },
    onError: (err) => {
      setConfirmOpen(false);
      reportFailure(
        err.status === 409 ? 'Already finalized' : err.status === 422 ? 'Nothing to finalize' : 'Could not finalize payroll',
        err,
      );
    },
  });

  const refreshPreview = async () => {
    setBanner(null);
    const result = await previewQuery.refetch();
    if (result.error) {
      reportFailure('Preview failed', result.error);
      return;
    }
    if (result.data) {
      toast.success(
        'Preview refreshed',
        `${monthLabel(month)} · ${number(result.data.items?.length)} employee(s) · net ${PKR(result.data.totals?.net, { compact: true })}`,
      );
    }
  };

  const onMonthChange = (event) => {
    setMonth(event.target.value);
    setSelectedRunId(null);
    setDetail(null);
    setBanner(null);
  };

  const selectRun = (run) => {
    setSelectedRunId(run.id);
    setMonth(run.month);
    setDetail(null);
    setBanner(null);
  };

  const exportCsv = async (run) => {
    const id = run?.id || exportId;
    if (!id) return;
    const csvMonth = run?.month || month;
    setCsvLoading(id);
    try {
      await downloadFile(`/payroll/runs/${id}/csv`, `payroll-${csvMonth}.csv`);
    } catch (err) {
      reportFailure('Export failed', err);
    } finally {
      setCsvLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payroll"
        title="Monthly payroll"
        description="Preview the month, generate the draft and lock it. Every figure is computed from the attendance records for that month."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Payroll month" className="w-[168px]">
              {(props) => <Input {...props} type="month" value={month} onChange={onMonthChange} />}
            </Field>
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={previewQuery.isFetching}
              disabled={!month}
              onClick={refreshPreview}
            >
              Refresh preview
            </Button>
            <Button
              icon={FilePlus2}
              loading={generate.isPending}
              disabled={!canGenerate}
              title={generateTitle}
              onClick={() => generate.mutate()}
            >
              Generate draft
            </Button>
            <Button
              variant="success"
              icon={Lock}
              disabled={!canFinalize}
              title={finalizeTitle}
              onClick={() => setConfirmOpen(true)}
            >
              Finalize
            </Button>
            <Button
              variant="outline"
              icon={Download}
              loading={Boolean(exportId) && csvLoading === exportId}
              disabled={!exportId}
              title={exportId ? 'Download this run as CSV.' : 'Generate a draft first.'}
              onClick={() => exportCsv()}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      <InlineBanner banner={banner} onDismiss={() => setBanner(null)} />

      {previewQuery.isLoading ? (
        <PreviewSkeleton />
      ) : previewQuery.isError ? (
        <Card>
          <ErrorState message={previewQuery.error?.message} onRetry={() => previewQuery.refetch()} />
        </Card>
      ) : !preview ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="Pick a month"
            description="Choose a payroll month above to compute what each employee would be paid."
          />
        </Card>
      ) : (
        <>
          <StatusBanner
            month={month}
            status={status}
            finalizedAt={viewedRun?.finalizedAt}
            employeeCount={viewedRun?.employeeCount ?? items.length}
          />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Gross"
              value={PKR(totals.gross, { compact: true })}
              hint="Full monthly gross"
              icon={Wallet}
              tone="violet"
            />
            <StatCard
              label="Prorated gross"
              value={PKR(totals.proratedGross, { compact: true })}
              hint={`${number(preview.workingDays)} working days`}
              icon={CalendarDays}
              tone="cyan"
            />
            <StatCard
              label="Deductions"
              value={PKR(totals.deductions, { compact: true })}
              hint="Absence, leave, half days"
              icon={TrendingDown}
              tone="amber"
            />
            <StatCard
              label="Tax"
              value={PKR(totals.tax, { compact: true })}
              hint="Illustrative slabs"
              icon={ShieldCheck}
              tone="rose"
            />
            <StatCard
              label="Net"
              value={PKR(totals.net, { compact: true })}
              hint="Take-home for the month"
              icon={CircleDollarSign}
              tone="mint"
              className="col-span-2 lg:col-span-1"
            />
          </div>

          <Card>
            <CardHeader
              icon={Users}
              title={viewedRun ? `Saved ${statusLabel(viewedRun.status)} run` : 'Live preview'}
              subtitle={
                viewedRun
                  ? `Stored figures for ${monthLabel(month)} · ${number(items.length)} employee(s)`
                  : `Computed from attendance · ${number(items.length)} employee(s) · click a row for the breakdown`
              }
              action={
                viewedRun && viewedRun.status === 'draft' ? (
                  <Button variant="ghost" icon={RefreshCw} onClick={() => setSelectedRunId(null)}>
                    Live preview
                  </Button>
                ) : null
              }
            />

            {items.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nobody is eligible this month"
                description="No employee joined before this month ended, or everyone has already exited. Add employees, then refresh the preview."
              />
            ) : (
              <Table caption={`Payroll for ${monthLabel(month)}`}>
                <thead>
                  <tr>
                    <Th>Employee</Th>
                    <Th className="text-right" title="Eligible / working days">
                      Days
                    </Th>
                    <Th className="text-right">Present</Th>
                    <Th className="text-right">Late</Th>
                    <Th className="text-right">Absent</Th>
                    <Th className="text-right">Half</Th>
                    <Th className="text-right">Gross</Th>
                    <Th className="text-right">Deductions</Th>
                    <Th className="text-right">Tax</Th>
                    <Th className="text-right">Net</Th>
                    <Th>
                      <span className="sr-only">Details</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <Tr
                      key={item.employeeId}
                      className="cursor-pointer"
                      onClick={() => setDetail(item)}
                      title={`Open ${item.name}'s breakdown`}
                    >
                      <Td>
                        <button
                          type="button"
                          onClick={() => setDetail(item)}
                          className="flex min-h-10 items-center gap-2.5 text-left"
                        >
                          <Avatar name={item.name} size={30} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-text">{item.name}</span>
                            <span className="block truncate text-[11.5px] text-text-faint">
                              {item.code}
                              {item.department ? ` · ${item.department}` : ''}
                            </span>
                          </span>
                        </button>
                      </Td>
                      <Td className="whitespace-nowrap text-right font-mono">
                        {number(item.eligibleDays)}/{number(item.workingDays)}
                      </Td>
                      <Td className="text-right font-mono">{number(item.presentDays)}</Td>
                      <Td className={cn('text-right font-mono', item.lateDays ? 'text-amber' : '')}>
                        {number(item.lateDays)}
                      </Td>
                      <Td className={cn('text-right font-mono', item.absentDays ? 'text-rose' : '')}>
                        {number(item.absentDays)}
                      </Td>
                      <Td className={cn('text-right font-mono', item.halfDays ? 'text-amber' : '')}>
                        {number(item.halfDays)}
                      </Td>
                      <Td className="whitespace-nowrap text-right font-mono">{PKR(item.gross)}</Td>
                      <Td className="whitespace-nowrap text-right font-mono text-rose">
                        {moneySigned(-(Number(item.totalDeductions) || 0))}
                      </Td>
                      <Td className="whitespace-nowrap text-right font-mono">{PKR(item.tax)}</Td>
                      <Td className="whitespace-nowrap text-right font-mono font-medium text-mint">{PKR(item.net)}</Td>
                      <Td className="text-right">
                        <span className="inline-flex text-text-faint" aria-hidden="true">
                          <ChevronRight size={15} />
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      <Card>
        <CardHeader
          icon={ReceiptText}
          title="Run history"
          subtitle="Every month that has a run. Open one to see its stored figures."
          action={
            <Button
              variant="ghost"
              icon={RefreshCw}
              loading={runsQuery.isFetching}
              onClick={() => runsQuery.refetch()}
            >
              Refresh
            </Button>
          }
        />

        {runsQuery.isLoading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : runsQuery.isError ? (
          <ErrorState message={runsQuery.error?.message} onRetry={() => runsQuery.refetch()} />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No payroll runs yet"
            description="Generate a draft above and it will be listed here with its totals."
          />
        ) : (
          <Table caption="Payroll run history">
            <thead>
              <tr>
                <Th>Month</Th>
                <Th>Status</Th>
                <Th className="text-right">Employees</Th>
                <Th className="text-right">Net</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const active = (viewedRun?.id || preview?.existingRun?.id) === run.id;
                return (
                  <Tr key={run.id} className={cn(active && 'bg-violet/[0.07]')}>
                    <Td>
                      <span className="font-medium text-text">{monthLabel(run.month)}</span>
                      {active ? (
                        <span className="ml-2">
                          <Badge tone="violet">Viewing</Badge>
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={toneOf(run.status)} dot>
                        {statusLabel(run.status)}
                      </Badge>
                    </Td>
                    <Td className="text-right font-mono">{number(run.employeeCount)}</Td>
                    <Td className="whitespace-nowrap text-right font-mono text-mint">
                      {PKR(run.totals?.net, { compact: true })}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" icon={ArrowUpRight} onClick={() => selectRun(run)}>
                          Open
                        </Button>
                        <Button
                          variant="outline"
                          icon={Download}
                          loading={csvLoading === run.id}
                          onClick={() => exportCsv(run)}
                        >
                          CSV
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => finalize.mutate()}
        loading={finalize.isPending}
        tone="danger"
        title={`Finalize ${monthLabel(month)} payroll?`}
        description="This locks the month forever. Totals can no longer be regenerated, payslips become downloadable, and every employee is notified. This cannot be undone."
        confirmLabel="Finalize & lock"
      />

      <DetailModal item={detail} month={month} onClose={() => setDetail(null)} />
    </div>
  );
}

export default function Payroll() {
  const { role } = useAuth();
  return role === 'employee' ? <MyPayslips /> : <PayrollManagement />;
}
