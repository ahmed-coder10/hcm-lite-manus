import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  CalendarDays,
  Check,
  Info,
  MessageSquare,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  Wand2,
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
  Progress,
  Select,
  Skeleton,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  Tr,
  cn,
} from '../../components/ui';
import { del, get, patch, post } from '../../lib/api';
import { dateLabel, relativeTime, statusLabel, STATUS_TONE, todayKey } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const BLANK_FORM = { leaveTypeId: '', startDate: '', endDate: '', reason: '' };

/* ------------------------------- utilities -------------------------------- */

function parseKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return null;
  const [y, m, d] = String(key).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Working days, skipping configured weekends. Holidays are enforced server-side. */
function countWorkingDays(startKey, endKey, weekendDays = [6, 0]) {
  const start = parseKey(startKey);
  const end = parseKey(endKey);
  if (!start || !end || end < start) return 0;
  const weekend = new Set((weekendDays || []).map(Number));
  let total = 0;
  const cursor = new Date(start);
  for (let i = 0; i < 400 && cursor <= end; i += 1) {
    if (!weekend.has(cursor.getDay())) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

function LeaveStatusBadge({ status }) {
  return (
    <Badge tone={STATUS_TONE[status] || 'neutral'} dot>
      {statusLabel(status)}
    </Badge>
  );
}

function LeaveTypePill({ name, color, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11.5px] text-text-muted',
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color || '#7C5CFF' }}
        aria-hidden="true"
      />
      {name || 'Leave'}
    </span>
  );
}

function dateRangeLabel(startDate, endDate, options = { withYear: false }) {
  if (startDate === endDate) return dateLabel(startDate, options);
  return `${dateLabel(startDate, options)} – ${dateLabel(endDate, options)}`;
}

/* --------------------------------- page ----------------------------------- */

export default function Leave() {
  const { isStaff } = useAuth();
  return isStaff ? <StaffLeave /> : <EmployeeLeave />;
}

/* ----------------------------- employee view ------------------------------ */

function EmployeeLeave() {
  const { settings } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const year = new Date().getFullYear();
  const weekendDays = settings?.weekendDays || [6, 0];

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [errors, setErrors] = useState({});
  const [appliedVia, setAppliedVia] = useState('web');
  const [aiNote, setAiNote] = useState(null);
  const [smartText, setSmartText] = useState('');
  const [smartError, setSmartError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);

  const typesQuery = useQuery({
    queryKey: ['leave', 'types'],
    queryFn: () => get('/leave/types'),
  });

  const balancesQuery = useQuery({
    queryKey: ['leave', 'balances', year],
    queryFn: () => get(`/leave/balances?year=${year}`),
  });

  const requestsQuery = useQuery({
    queryKey: ['leave', 'mine'],
    queryFn: () => get('/leave?status=all'),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => post('/leave', payload),
    onSuccess: (leave) => {
      toast.success(
        'Leave requested',
        `${leave?.days || 0} working day${leave?.days === 1 ? '' : 's'} submitted for approval.`,
      );
      setModalOpen(false);
      setForm({ ...BLANK_FORM });
      setAiNote(null);
      setAppliedVia('web');
      setErrors({});
      setSmartText('');
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => setErrors({ ...(err.details || {}), form: err.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => del(`/leave/${id}`),
    onSuccess: () => {
      toast.success('Request withdrawn', 'Those days are back in your balance.');
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => toast.error('Could not cancel the request', err.message),
  });

  const smartMutation = useMutation({
    mutationFn: () => post('/ai/smart-leave', { text: smartText.trim() }),
    onSuccess: (data) => {
      setSmartError('');
      const prefill = data?.prefilled || {};
      const types = typesQuery.data || [];
      const byCode = prefill.leaveTypeCode
        ? types.find(
            (type) => String(type.code || '').toLowerCase() === String(prefill.leaveTypeCode).toLowerCase(),
          )
        : null;
      const byName = prefill.leaveType
        ? types.find(
            (type) => String(type.name || '').toLowerCase() === String(prefill.leaveType).toLowerCase(),
          )
        : null;
      const matched = byCode || byName || null;

      setForm({
        leaveTypeId: matched?.id || '',
        startDate: prefill.startDate || '',
        endDate: prefill.endDate || prefill.startDate || '',
        reason: prefill.reason || '',
      });
      setAppliedVia(data?.aiGenerated ? 'ai' : 'web');
      setAiNote({
        aiGenerated: Boolean(data?.aiGenerated),
        degraded: Boolean(data?.degraded),
        note: prefill.note || '',
      });
      setErrors(
        matched ? {} : { leaveTypeId: 'Pick the leave type — we could not match that suggestion.' },
      );
      setModalOpen(true);
      toast.info('Suggestion ready', 'Check every field, then press Submit — nothing is created yet.');
    },
    onError: (err) => {
      setSmartError(err.message);
      toast.error('Could not read that', err.message);
    },
  });

  const balances = balancesQuery.data || [];
  const requests = requestsQuery.data || [];
  const types = typesQuery.data || [];
  const workingDays = countWorkingDays(form.startDate, form.endDate, weekendDays);

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const updateDate = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next.startDate;
      delete next.endDate;
      delete next.dates;
      return next;
    });
  };

  const openNew = () => {
    setForm({ ...BLANK_FORM });
    setAppliedVia('web');
    setAiNote(null);
    setErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    if (createMutation.isPending) return;
    setModalOpen(false);
  };

  const submitRequest = () => {
    const next = {};
    if (!form.leaveTypeId) next.leaveTypeId = 'Choose a leave type';
    if (!form.startDate) next.startDate = 'Pick a start date';
    if (!form.endDate) next.endDate = 'Pick an end date';
    else if (form.startDate && form.endDate < form.startDate) {
      next.endDate = 'The end date cannot be before the start date';
    } else if (form.startDate && workingDays === 0) {
      next.endDate = 'Those dates are all weekends — pick at least one working day';
    }
    if (form.reason.trim().length < 5) next.reason = 'Add a short reason (at least 5 characters)';
    setErrors(next);
    if (Object.keys(next).length) return;

    createMutation.mutate({
      leaveTypeId: form.leaveTypeId,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason.trim(),
      appliedVia,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leave"
        title="My leave"
        description="Your balance, your requests, and a plain-words shortcut for filling the form."
        actions={
          <Button icon={Plus} onClick={openNew}>
            New request
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {balancesQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)
        ) : balancesQuery.isError ? (
          <Card className="sm:col-span-2 xl:col-span-4">
            <ErrorState message={balancesQuery.error?.message} onRetry={() => balancesQuery.refetch()} />
          </Card>
        ) : !balances.length ? (
          <Card className="sm:col-span-2 xl:col-span-4">
            <EmptyState
              icon={Plane}
              title="No leave types available"
              description="An Admin needs to configure leave types before you can request time off."
            />
          </Card>
        ) : (
          balances.map((balance, index) => (
            <BalanceCard key={balance.leaveTypeId} balance={balance} index={index} />
          ))
        )}
      </div>

      <Card>
        <CardHeader
          title="Ask in plain words"
          subtitle="Describe the leave you need and we will fill the form for you to review."
          icon={Sparkles}
        />
        <div className="space-y-3 p-5">
          <Field
            label="What do you need?"
            error={smartError}
            hint='For example: "I need sick leave next Monday and Tuesday because of a fever."'
          >
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                maxLength={500}
                value={smartText}
                onChange={(event) => {
                  setSmartText(event.target.value);
                  if (smartError) setSmartError('');
                }}
                placeholder="Tell us in your own words — dates, type and a short reason."
              />
            )}
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-text-faint">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              Nothing is submitted until you review the form and press Submit.
            </p>
            <Button
              icon={Wand2}
              loading={smartMutation.isPending}
              disabled={smartText.trim().length < 4 || typesQuery.isLoading}
              onClick={() => smartMutation.mutate()}
            >
              Prefill my request
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="My requests"
          subtitle={requestsQuery.data ? `${requests.length} request${requests.length === 1 ? '' : 's'}, newest first` : 'Your leave history'}
          icon={CalendarDays}
          action={
            <Button variant="secondary" size="sm" className="h-10" icon={Plus} onClick={openNew}>
              New request
            </Button>
          }
        />
        <div className="p-0">
          {requestsQuery.isLoading ? (
            <div className="space-y-2 p-4 sm:p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : requestsQuery.isError ? (
            <ErrorState message={requestsQuery.error?.message} onRetry={() => requestsQuery.refetch()} />
          ) : !requests.length ? (
            <EmptyState
              icon={CalendarDays}
              title="No leave requests yet"
              description="Request annual, sick or casual leave here — your balance updates after HR approves."
              action={
                <Button variant="secondary" icon={Plus} onClick={openNew}>
                  Request leave
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <LeaveTypePill name={request.leaveTypeName} color={request.leaveTypeColor} />
                      <LeaveStatusBadge status={request.status} />
                      {request.appliedVia === 'ai' ? <Badge tone="cyan">AI prefill</Badge> : null}
                    </div>
                    <p className="mt-2 text-[14px] font-medium text-text">
                      {dateRangeLabel(request.startDate, request.endDate)} · {request.days} day
                      {request.days === 1 ? '' : 's'}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{request.reason}</p>
                    {request.comment ? (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 text-[12.5px] leading-relaxed text-text-muted">
                        <MessageSquare size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                          <span className="text-text-faint">
                            HR{request.decidedAt ? ` · ${relativeTime(request.decidedAt)}` : ''}:
                          </span>{' '}
                          {request.comment}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  {request.status === 'pending' ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className="h-10 shrink-0"
                      icon={X}
                      onClick={() => setCancelTarget(request)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Request leave"
        description="Working days only — weekends are skipped. Holidays are confirmed by the server."
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitRequest} loading={createMutation.isPending} icon={Check}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {aiNote ? (
            <div
              className={cn(
                'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] leading-relaxed text-text-muted',
                aiNote.aiGenerated ? 'border-violet/30 bg-violet/10' : 'border-amber/30 bg-amber/10',
              )}
            >
              {aiNote.aiGenerated ? (
                <Sparkles size={14} className="mt-0.5 shrink-0 text-violet-soft" aria-hidden="true" />
              ) : (
                <Info size={14} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
              )}
              <p>
                {aiNote.aiGenerated
                  ? 'AI-generated suggestion — please confirm every field before submitting.'
                  : 'This is a basic suggestion because AI was unavailable — please check every field.'}
                {aiNote.note ? ` ${aiNote.note}` : ''}
              </p>
            </div>
          ) : null}

          {errors.form ? (
            <div role="alert" className="rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose">
              {errors.form}
            </div>
          ) : null}

          <Field label="Leave type" error={errors.leaveTypeId} required>
            {(props) => (
              <Select
                {...props}
                value={form.leaveTypeId}
                onChange={(event) => update('leaveTypeId', event.target.value)}
                disabled={typesQuery.isLoading}
              >
                <option value="">{typesQuery.isLoading ? 'Loading leave types…' : 'Choose a leave type'}</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                    {type.unlimited ? ' · unlimited' : ` · ${type.annualQuota} days/year`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {typesQuery.isError ? (
            <p className="text-[12px] text-rose">Leave types could not be loaded — close this and try again.</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start date" error={errors.startDate} required>
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={form.startDate}
                  onChange={(event) => updateDate('startDate', event.target.value)}
                />
              )}
            </Field>
            <Field label="End date" error={errors.endDate} required>
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={form.endDate}
                  onChange={(event) => updateDate('endDate', event.target.value)}
                />
              )}
            </Field>
          </div>

          {errors.dates ? (
            <p className="text-[12.5px] text-rose">{errors.dates}</p>
          ) : null}

          <div
            className={cn(
              'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] leading-relaxed',
              workingDays > 0 && form.startDate && form.endDate
                ? 'border-cyan/25 bg-cyan/10 text-text-muted'
                : 'border-white/10 bg-white/[0.03] text-text-faint',
            )}
          >
            <CalendarCheck size={14} className="mt-0.5 shrink-0 text-cyan" aria-hidden="true" />
            <p>
              {form.startDate && form.endDate && form.endDate >= form.startDate
                ? workingDays > 0
                  ? `${workingDays} working day${workingDays === 1 ? '' : 's'} — weekends are skipped.`
                  : 'Those dates are all weekends — pick at least one working day.'
                : 'Pick both dates to see the working-day count.'}
            </p>
          </div>

          <Field label="Reason" error={errors.reason} required hint="A sentence is enough for HR to decide.">
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                maxLength={500}
                value={form.reason}
                onChange={(event) => update('reason', event.target.value)}
                placeholder="Family wedding out of town."
              />
            )}
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        title="Withdraw this request?"
        description={
          cancelTarget
            ? `${cancelTarget.leaveTypeName} from ${dateRangeLabel(cancelTarget.startDate, cancelTarget.endDate)} will be cancelled.`
            : ''
        }
        confirmLabel="Withdraw request"
        tone="danger"
        loading={cancelMutation.isPending}
      />
    </div>
  );
}

function BalanceCard({ balance, index }) {
  const unlimited = Boolean(balance.unlimited);
  const allocated = balance.allocated ?? 0;
  const used = balance.used || 0;
  const pending = balance.pending || 0;
  const remaining = balance.remaining ?? Math.max(0, allocated - used);
  const percent = unlimited || !allocated ? 0 : Math.min(100, Math.round((used / allocated) * 100));
  const tones = ['violet', 'mint', 'amber', 'rose'];

  return (
    <Card className="p-4" hover>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: balance.color || '#7C5CFF' }}
            aria-hidden="true"
          />
          <p className="truncate text-[13px] font-medium text-text">{balance.name}</p>
        </div>
        {unlimited ? (
          <Badge tone="cyan">Unlimited</Badge>
        ) : pending ? (
          <Badge tone="amber">{pending} pending</Badge>
        ) : (
          <Badge tone={balance.isPaid ? 'mint' : 'neutral'}>{balance.isPaid ? 'Paid' : 'Unpaid'}</Badge>
        )}
      </div>

      <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-text">
        {unlimited ? 'Unlimited' : remaining}
      </p>
      <p className="text-[12px] text-text-faint">
        {unlimited
          ? 'No annual cap for this leave type'
          : `of ${allocated} days left · ${used} used${pending ? ` · ${pending} pending` : ''}`}
      </p>
      {unlimited ? (
        <p className="mt-3 text-[11.5px] text-text-faint">No annual cap — every request still needs approval.</p>
      ) : (
        <Progress
          className="mt-3"
          value={percent}
          tone={tones[index % tones.length]}
          label={`${balance.name} used`}
        />
      )}
    </Card>
  );
}

/* -------------------------------- staff view ------------------------------ */

function StaffLeave() {
  const [tab, setTab] = useState('approvals');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leave"
        title="Leave overview"
        description="Approve requests, search the history, and see who is away today."
      />
      <div className="overflow-x-auto">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'approvals', label: 'Approvals' },
            { value: 'all', label: 'All requests' },
            { value: 'team', label: 'Team calendar' },
          ]}
        />
      </div>
      {tab === 'approvals' ? <ApprovalQueue /> : null}
      {tab === 'all' ? <AllRequests /> : null}
      {tab === 'team' ? <TeamCalendar /> : null}
    </div>
  );
}

function ApprovalQueue() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState({});

  const pendingQuery = useQuery({
    queryKey: ['leave', 'staff', 'pending'],
    queryFn: () => get('/leave/inbox?status=pending'),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision, comment }) => patch(`/leave/${id}/decision`, { decision, comment }),
    onSuccess: (_data, variables) => {
      toast.success(
        `Leave ${variables.decision}`,
        variables.decision === 'approved' ? 'The employee has been notified.' : 'The employee can see your comment.',
      );
      setComments((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => {
      toast.error('Could not save the decision', err.message);
      queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
  });

  const requests = pendingQuery.data || [];

  const isDeciding = (id, decision) =>
    decideMutation.isPending &&
    decideMutation.variables?.id === id &&
    decideMutation.variables?.decision === decision;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-muted">
          {pendingQuery.data
            ? `${requests.length} request${requests.length === 1 ? '' : 's'} waiting for a decision`
            : 'Loading the approval queue…'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-10"
          icon={RefreshCw}
          onClick={() => pendingQuery.refetch()}
          loading={pendingQuery.isFetching}
          disabled={pendingQuery.isFetching}
        >
          Refresh
        </Button>
      </div>

      {pendingQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : pendingQuery.isError ? (
        <Card>
          <ErrorState message={pendingQuery.error?.message} onRetry={() => pendingQuery.refetch()} />
        </Card>
      ) : !requests.length ? (
        <Card>
          <EmptyState
            icon={Check}
            title="Nothing waiting for approval"
            description="New leave requests will land here. Approved and rejected ones move to All requests."
          />
        </Card>
      ) : (
        requests.map((request) => (
          <Card key={request.id} className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={request.employeeName || 'Employee'} size={42} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-[15px] font-semibold text-text">
                      {request.employeeName || 'Employee'}
                    </p>
                    {request.appliedVia === 'ai' ? (
                      <Badge tone="cyan" dot>
                        AI prefill
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-text-muted">
                    {request.employeeCode}
                    {request.departmentName ? ` · ${request.departmentName}` : ''}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <LeaveTypePill name={request.leaveTypeName} color={request.leaveTypeColor} />
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-muted">
                      <CalendarDays size={13} aria-hidden="true" />
                      {dateRangeLabel(request.startDate, request.endDate)}
                    </span>
                    <Badge tone="faint">
                      {request.days} day{request.days === 1 ? '' : 's'}
                    </Badge>
                  </div>

                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-text-muted">{request.reason}</p>
                  <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-faint">
                    Applied {relativeTime(request.createdAt)} · {request.appliedVia === 'ai' ? 'via assistant' : 'via web'}
                  </p>
                </div>
              </div>

              <div className="w-full shrink-0 space-y-2 lg:w-72">
                <Field label="Comment" hint="Recommended — the employee sees it">
                  {(props) => (
                    <Input
                      {...props}
                      value={comments[request.id] || ''}
                      onChange={(event) =>
                        setComments((current) => ({ ...current, [request.id]: event.target.value }))
                      }
                      placeholder="Add a note for the record"
                      maxLength={300}
                    />
                  )}
                </Field>
                <div className="flex gap-2">
                  <Button
                    variant="success"
                    className="flex-1"
                    icon={Check}
                    loading={isDeciding(request.id, 'approved')}
                    disabled={decideMutation.isPending}
                    onClick={() =>
                      decideMutation.mutate({
                        id: request.id,
                        decision: 'approved',
                        comment: (comments[request.id] || '').trim(),
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    icon={X}
                    loading={isDeciding(request.id, 'rejected')}
                    disabled={decideMutation.isPending}
                    onClick={() =>
                      decideMutation.mutate({
                        id: request.id,
                        decision: 'rejected',
                        comment: (comments[request.id] || '').trim(),
                      })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function AllRequests() {
  const [status, setStatus] = useState('all');
  const [typeId, setTypeId] = useState('');
  const [search, setSearch] = useState('');

  const requestsQuery = useQuery({
    queryKey: ['leave', 'staff', 'all'],
    queryFn: () => get('/leave?status=all&limit=200'),
  });

  const typesQuery = useQuery({
    queryKey: ['leave', 'types'],
    queryFn: () => get('/leave/types'),
  });

  const leaves = requestsQuery.data || [];
  const types = typesQuery.data || [];
  const term = search.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      leaves.filter((request) => {
        if (status !== 'all' && request.status !== status) return false;
        if (typeId && request.leaveTypeId !== typeId) return false;
        if (term) {
          const haystack = [request.employeeName, request.employeeCode, request.departmentName]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      }),
    [leaves, status, typeId, term],
  );

  const reset = () => {
    setStatus('all');
    setTypeId('');
    setSearch('');
  };

  const hasFilters = status !== 'all' || Boolean(typeId) || Boolean(term);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status">
            {(props) => (
              <Select {...props} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            )}
          </Field>
          <Field label="Leave type">
            {(props) => (
              <Select {...props} value={typeId} onChange={(event) => setTypeId(event.target.value)}>
                <option value="">All leave types</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Employee">
            {(props) => (
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
                  aria-hidden="true"
                />
                <Input
                  {...props}
                  type="search"
                  className="pl-9"
                  placeholder="Search name, code or department"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            )}
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-text-faint">
            Showing {filtered.length} of {leaves.length} request{leaves.length === 1 ? '' : 's'}
          </p>
          {hasFilters ? (
            <Button variant="ghost" size="sm" className="h-10" onClick={reset}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="All leave requests" subtitle="Newest first" icon={CalendarDays} />
        <div className="p-4 sm:p-5">
          {requestsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : requestsQuery.isError ? (
            <ErrorState message={requestsQuery.error?.message} onRetry={() => requestsQuery.refetch()} />
          ) : !filtered.length ? (
            <EmptyState
              icon={CalendarDays}
              title={leaves.length ? 'No requests match these filters' : 'No leave requests yet'}
              description={
                leaves.length
                  ? 'Try another status, leave type or employee search.'
                  : 'Requests submitted by employees will appear here.'
              }
              action={
                leaves.length ? (
                  <Button variant="secondary" onClick={reset}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table caption="All leave requests">
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Type</Th>
                  <Th>Dates</Th>
                  <Th>Days</Th>
                  <Th>Applied via</Th>
                  <Th>Status</Th>
                  <Th>Decision note</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((request) => (
                  <Tr key={request.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={request.employeeName || 'Employee'} size={30} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-text">
                            {request.employeeName || 'Employee'}
                          </p>
                          <p className="truncate font-mono text-[10.5px] uppercase tracking-wide text-text-faint">
                            {request.employeeCode}
                            {request.departmentName ? ` · ${request.departmentName}` : ''}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <LeaveTypePill name={request.leaveTypeName} color={request.leaveTypeColor} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      {dateRangeLabel(request.startDate, request.endDate, { withYear: true })}
                    </Td>
                    <Td>{request.days}</Td>
                    <Td>
                      {request.appliedVia === 'ai' ? (
                        <Badge tone="cyan">AI prefill</Badge>
                      ) : (
                        <Badge tone="neutral">Web</Badge>
                      )}
                    </Td>
                    <Td>
                      <LeaveStatusBadge status={request.status} />
                    </Td>
                    <Td className="max-w-[220px]">
                      {request.comment ? (
                        <div>
                          <p className="line-clamp-2 text-[12.5px] text-text-muted">{request.comment}</p>
                          {request.decidedAt ? (
                            <p className="mt-0.5 text-[10.5px] text-text-faint">{relativeTime(request.decidedAt)}</p>
                          ) : null}
                        </div>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

function TeamCalendar() {
  const onLeaveQuery = useQuery({
    queryKey: ['leave', 'staff', 'on-leave-today'],
    queryFn: () => get('/leave/on-leave-today'),
  });

  const allQuery = useQuery({
    queryKey: ['leave', 'staff', 'all'],
    queryFn: () => get('/leave?status=all&limit=200'),
  });

  const onLeave = onLeaveQuery.data || [];
  const today = todayKey();

  const groups = useMemo(() => {
    const approved = (allQuery.data || [])
      .filter((request) => request.status === 'approved' && request.startDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const result = [];
    approved.forEach((request) => {
      const last = result[result.length - 1];
      if (last && last.date === request.startDate) last.items.push(request);
      else result.push({ date: request.startDate, items: [request] });
    });
    return result.slice(0, 12);
  }, [allQuery.data, today]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="On leave today" subtitle={dateLabel(today, { weekday: true })} icon={Plane} />
        <div className="p-4 sm:p-5">
          {onLeaveQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : onLeaveQuery.isError ? (
            <ErrorState message={onLeaveQuery.error?.message} onRetry={() => onLeaveQuery.refetch()} />
          ) : !onLeave.length ? (
            <EmptyState
              icon={Users}
              title="Everyone is in today"
              description="No approved leave covers today. Upcoming requests appear on the right."
            />
          ) : (
            <div className="space-y-2">
              {onLeave.map((person) => (
                <div
                  key={`${person.employee_code}-${person.type}`}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                >
                  <Avatar name={person.name || 'Employee'} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text">{person.name}</p>
                    <p className="truncate font-mono text-[10.5px] uppercase tracking-wide text-text-faint">
                      {person.employee_code}
                      {person.department ? ` · ${person.department}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <LeaveTypePill name={person.type} />
                    <span className={cn('text-[10.5px]', person.isPaid ? 'text-mint' : 'text-text-faint')}>
                      {person.isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Upcoming approved leave"
          subtitle="Grouped by the first day away"
          icon={CalendarCheck}
        />
        <div className="p-4 sm:p-5">
          {allQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : allQuery.isError ? (
            <ErrorState message={allQuery.error?.message} onRetry={() => allQuery.refetch()} />
          ) : !groups.length ? (
            <EmptyState
              icon={CalendarCheck}
              title="No upcoming leave"
              description="Approved requests that start today or later will be grouped here by date."
            />
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.date}>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                      {dateLabel(group.date, { weekday: true })}
                    </p>
                    <span className="h-px flex-1 bg-white/[0.06]" aria-hidden="true" />
                    <span className="text-[11px] text-text-faint">{group.items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-text">{request.employeeName}</p>
                          <p className="truncate text-[11.5px] text-text-faint">
                            {request.leaveTypeName} · {request.days} day{request.days === 1 ? '' : 's'} ·{' '}
                            {dateRangeLabel(request.startDate, request.endDate)}
                          </p>
                        </div>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: request.leaveTypeColor || '#7C5CFF' }}
                          aria-hidden="true"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
