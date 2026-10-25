import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ClipboardList,
  Info,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  ScanFace,
  Timer,
  Users,
  X,
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
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Spinner,
  StatCard,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  Tr,
  cn,
} from '../../components/ui';
import { get, patch, post } from '../../lib/api';
import {
  currentMonth,
  dateLabel,
  hoursFromMinutes,
  monthLabel,
  pct,
  relativeTime,
  statusLabel,
  STATUS_TONE,
  timeLabel,
  titleCase,
  todayKey,
} from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FACE_DETECTOR_SUPPORTED =
  typeof window !== 'undefined' && typeof window.FaceDetector === 'function';

const DAY_STYLE = {
  present: 'border-mint/25 bg-mint/10',
  late: 'border-amber/30 bg-amber/10',
  half_day: 'border-amber/25 bg-amber/10',
  missing_checkout: 'border-amber/40 bg-amber/20',
  absent: 'border-rose/30 bg-rose/10',
  on_leave: 'border-violet/30 bg-violet/10',
  holiday: 'border-cyan/30 bg-cyan/10',
  weekend: 'border-white/[0.05] bg-white/[0.015] text-text-faint',
  not_checked_in: 'border-white/10 bg-white/[0.04]',
  upcoming: 'border-white/[0.05] bg-transparent text-text-faint',
  not_employed: 'border-transparent bg-transparent text-text-faint/70',
};

const DAY_DOT = {
  present: 'bg-mint',
  late: 'bg-amber',
  half_day: 'bg-amber/70',
  missing_checkout: 'bg-amber',
  absent: 'bg-rose',
  on_leave: 'bg-violet',
  holiday: 'bg-cyan',
  weekend: 'bg-white/20',
  not_checked_in: 'bg-white/30',
};

const LEGEND = [
  { key: 'present', label: 'Present', swatch: 'bg-mint' },
  { key: 'late', label: 'Late', swatch: 'bg-amber' },
  { key: 'half_day', label: 'Half day', swatch: 'bg-amber/70' },
  { key: 'on_leave', label: 'On leave', swatch: 'bg-violet' },
  { key: 'absent', label: 'Absent', swatch: 'bg-rose' },
  { key: 'holiday', label: 'Holiday', swatch: 'bg-cyan' },
  { key: 'weekend', label: 'Weekend', swatch: 'bg-white/20' },
];

/* ------------------------------- utilities -------------------------------- */

function parseKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return null;
  const [y, m, d] = String(key).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftMonthKey(month, delta) {
  const [y, m] = String(month).split('-').map(Number);
  const next = new Date(y, (m || 1) - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

/** Browser geolocation as a never-throwing promise. */
function locate() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({
        location: null,
        status: 'unsupported',
        message: 'This browser cannot share a location. Your check-in will be saved without a GPS fix.',
      });
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish({
        location: null,
        status: 'timeout',
        message: 'Location took too long. Your check-in will be saved without a GPS fix.',
      });
    }, 15000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish({
          location: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          },
          status: 'granted',
          message: '',
        });
      },
      (err) => {
        clearTimeout(timer);
        if (err.code === 1) {
          finish({
            location: null,
            status: 'denied',
            message: 'Location permission is off. You can still check in, but HR will not see a GPS fix.',
          });
        } else {
          finish({
            location: null,
            status: 'error',
            message: 'We could not read your location. You can still check in without a GPS fix.',
          });
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

function StatusBadge({ status }) {
  return (
    <Badge tone={STATUS_TONE[status] || 'neutral'} dot>
      {statusLabel(status)}
    </Badge>
  );
}

/* --------------------------------- page ----------------------------------- */

export default function Attendance() {
  const { employee, isStaff } = useAuth();
  const [tab, setTab] = useState('today');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title={isStaff ? 'Attendance' : 'My attendance'}
        description={
          isStaff
            ? 'The daily board for every employee, the corrections queue, and your own month.'
            : 'Check in, watch your month fill up, and ask HR to fix anything that looks wrong.'
        }
      />

      {isStaff ? (
        <div className="space-y-6">
          <div className="overflow-x-auto">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'today', label: 'Today' },
                { value: 'corrections', label: 'Corrections' },
                { value: 'mine', label: 'My attendance' },
              ]}
            />
          </div>
          {tab === 'today' ? <StaffToday /> : null}
          {tab === 'corrections' ? <StaffCorrections /> : null}
          {tab === 'mine' ? <MyAttendance employeeId={employee?.id || null} isStaffView /> : null}
        </div>
      ) : (
        <MyAttendance />
      )}
    </div>
  );
}

/* ----------------------------- employee view ------------------------------ */

function MyAttendance({ employeeId = null, isStaffView = false }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [cameraOpen, setCameraOpen] = useState(false);
  const [geoNote, setGeoNote] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    date: todayKey(),
    requestedCheckIn: '',
    requestedCheckOut: '',
    reason: '',
  });
  const [correctionErrors, setCorrectionErrors] = useState({});

  const linked = !isStaffView || Boolean(employeeId);

  const todayQuery = useQuery({
    queryKey: ['attendance', 'me', 'today'],
    queryFn: () => get('/attendance/me/today'),
    enabled: linked,
  });

  const calendarQuery = useQuery({
    queryKey: ['attendance', 'calendar', employeeId || 'me', month],
    queryFn: () => get(`/attendance/calendar?month=${month}${employeeId ? `&employeeId=${employeeId}` : ''}`),
    enabled: linked,
  });

  const correctionsQuery = useQuery({
    queryKey: ['attendance', 'corrections', employeeId || 'me'],
    queryFn: () => get(`/attendance/corrections${employeeId ? `?employeeId=${employeeId}` : ''}`),
    enabled: linked,
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      const geo = await locate();
      const locationRequired = Boolean(todayQuery.data?.geofence?.lat != null);
      setGeoNote(
        geo.status === 'granted'
          ? ''
          : locationRequired
            ? 'Location is off and this office requires a GPS fix. Allow location access and try again.'
            : geo.message,
      );
      return post('/attendance/check-in', { source: 'web', location: geo.location, faceVerified: false });
    },
    onSuccess: (data) => {
      toast.success('Checked in', data?.message || 'Your day has started.');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => toast.error('Could not check in', err.message),
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const geo = await locate();
      setGeoNote(geo.status === 'granted' ? '' : geo.message);
      return post('/attendance/check-out', { location: geo.location });
    },
    onSuccess: (data) => {
      toast.success('Checked out', data?.message || 'Have a good evening.');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => toast.error('Could not check out', err.message),
  });

  const correctionMutation = useMutation({
    mutationFn: (payload) => post('/attendance/corrections', payload),
    onSuccess: () => {
      toast.success('Correction requested', 'HR will review it and update your record.');
      setCorrectionOpen(false);
      setCorrectionErrors({});
      setCorrectionForm({ date: todayKey(), requestedCheckIn: '', requestedCheckOut: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => {
      setCorrectionErrors({ ...(err.details || {}), form: err.message });
      toast.error('Could not send request', err.message);
    },
  });

  const today = todayQuery.data;
  const counts = calendarQuery.data?.counts;
  const corrections = correctionsQuery.data || [];

  const openCorrection = () => {
    setCorrectionForm({ date: todayKey(), requestedCheckIn: '', requestedCheckOut: '', reason: '' });
    setCorrectionErrors({});
    setCorrectionOpen(true);
  };

  const submitCorrection = () => {
    const errors = {};
    if (!correctionForm.date) errors.date = 'Pick the date you want to correct';
    else if (parseKey(correctionForm.date) && correctionForm.date > todayKey()) {
      errors.date = 'You cannot correct a future date';
    }
    if (correctionForm.reason.trim().length < 5) {
      errors.reason = 'Explain what needs fixing (at least 5 characters)';
    }
    if (
      correctionForm.requestedCheckIn &&
      correctionForm.requestedCheckOut &&
      correctionForm.requestedCheckOut <= correctionForm.requestedCheckIn
    ) {
      errors.requestedCheckOut = 'Check-out must be after check-in';
    }
    setCorrectionErrors(errors);
    if (Object.keys(errors).length) return;
    correctionMutation.mutate({
      date: correctionForm.date,
      requestedCheckIn: correctionForm.requestedCheckIn || '',
      requestedCheckOut: correctionForm.requestedCheckOut || '',
      reason: correctionForm.reason.trim(),
    });
  };

  const handleCameraSuccess = (result) => {
    setCameraOpen(false);
    toast.success('Checked in', result?.message || 'Camera check-in saved.');
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
  };

  if (isStaffView && !employeeId) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title="No employee profile linked"
          description="Attendance is tracked per employee. Ask an Admin to link your account to an employee profile to use this tab."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {todayQuery.isLoading ? (
        <Skeleton className="h-[19rem] rounded-2xl" />
      ) : todayQuery.isError ? (
        <Card>
          <ErrorState message={todayQuery.error?.message} onRetry={() => todayQuery.refetch()} />
        </Card>
      ) : today ? (
        <TodayCard
          today={today}
          checkInLoading={checkInMutation.isPending}
          checkOutLoading={checkOutMutation.isPending}
          onCheckIn={() => checkInMutation.mutate()}
          onCheckOut={() => checkOutMutation.mutate()}
          onCamera={() => setCameraOpen(true)}
          geoNote={geoNote}
        />
      ) : null}

      {calendarQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
      ) : counts ? (
        <CountsRow counts={counts} />
      ) : null}

      <Card>
        <CardHeader
          title="Month calendar"
          subtitle={monthLabel(month)}
          icon={CalendarDays}
          action={
            <div className="flex items-center gap-1">
              <IconButton
                label="Previous month"
                icon={ChevronLeft}
                className="h-10 w-10"
                onClick={() => setMonth((m) => shiftMonthKey(m, -1))}
              />
              <IconButton
                label="Next month"
                icon={ChevronRight}
                className="h-10 w-10"
                onClick={() => setMonth((m) => shiftMonthKey(m, 1))}
              />
            </div>
          }
        />
        <div className="p-3 sm:p-5">
          {calendarQuery.isLoading ? (
            <CalendarSkeleton />
          ) : calendarQuery.isError ? (
            <ErrorState message={calendarQuery.error?.message} onRetry={() => calendarQuery.refetch()} />
          ) : (
            <CalendarGrid days={calendarQuery.data?.days || []} month={month} />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="My corrections"
          subtitle="Requested time fixes and their decisions"
          icon={ClipboardList}
          action={
            <Button size="sm" className="h-10" variant="secondary" icon={Plus} onClick={openCorrection}>
              Request a correction
            </Button>
          }
        />
        <div className="p-4 sm:p-5">
          {correctionsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : correctionsQuery.isError ? (
            <ErrorState message={correctionsQuery.error?.message} onRetry={() => correctionsQuery.refetch()} />
          ) : !corrections.length ? (
            <EmptyState
              icon={ClipboardList}
              title="No corrections requested"
              description="If a check-in or check-out is missing or wrong, ask HR to correct it."
              action={
                <Button variant="secondary" icon={Plus} onClick={openCorrection}>
                  Request a correction
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {corrections.map((item) => (
                <CorrectionRow key={item.id} correction={item} />
              ))}
            </div>
          )}
        </div>
      </Card>

      <CameraCheckInModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onSuccess={handleCameraSuccess}
        requiresLocation={Boolean(today?.geofence?.lat != null)}
      />

      <Modal
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        title="Request a correction"
        description="Tell HR what the right times were. Nothing changes until they approve it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCorrectionOpen(false)} disabled={correctionMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitCorrection} loading={correctionMutation.isPending} icon={Plus}>
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {correctionErrors.form ? (
            <div role="alert" className="rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose">
              {correctionErrors.form}
            </div>
          ) : null}

          <Field label="Date to correct" error={correctionErrors.date} required>
            {(props) => (
              <Input
                {...props}
                type="date"
                max={todayKey()}
                value={correctionForm.date}
                onChange={(e) => setCorrectionForm((f) => ({ ...f, date: e.target.value }))}
              />
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Check-in time" error={correctionErrors.requestedCheckIn} hint="Leave blank if it was fine">
              {(props) => (
                <Input
                  {...props}
                  type="time"
                  value={correctionForm.requestedCheckIn}
                  onChange={(e) => setCorrectionForm((f) => ({ ...f, requestedCheckIn: e.target.value }))}
                />
              )}
            </Field>
            <Field label="Check-out time" error={correctionErrors.requestedCheckOut} hint="Leave blank if it was fine">
              {(props) => (
                <Input
                  {...props}
                  type="time"
                  value={correctionForm.requestedCheckOut}
                  onChange={(e) => setCorrectionForm((f) => ({ ...f, requestedCheckOut: e.target.value }))}
                />
              )}
            </Field>
          </div>

          <Field label="What needs fixing?" error={correctionErrors.reason} required>
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                maxLength={500}
                placeholder="I forgot to check out on my way to a client visit."
                value={correctionForm.reason}
                onChange={(e) => setCorrectionForm((f) => ({ ...f, reason: e.target.value }))}
              />
            )}
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ today panel ------------------------------- */

function TimeStat({ label, value, icon: Icon }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11.5px] text-text-faint">
        <Icon size={12} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 truncate font-display text-lg font-semibold text-text">{value || '—'}</p>
    </div>
  );
}

function TodayCard({ today, onCheckIn, onCheckOut, onCamera, checkInLoading, checkOutLoading, geoNote }) {
  const record = today.record;

  let headline = 'Not checked in yet';
  let tone = 'faint';
  let subline = 'One tap starts your day.';
  if (record?.checkOutAt) {
    headline = 'Day complete';
    tone = 'mint';
    subline = 'Your hours are locked in for today.';
  } else if (record?.checkInAt) {
    headline = 'Checked in';
    tone = record.status === 'late' ? 'amber' : 'mint';
    subline = record.status === 'late' ? 'You are in — after the grace window.' : 'You are in. Have a good day.';
  } else if (today.onLeave) {
    headline = 'On leave today';
    tone = 'violet';
    subline = `Approved leave: ${today.onLeave}.`;
  }

  const worked = record?.workedMinutes
    ? hoursFromMinutes(record.workedMinutes)
    : record?.workedHours
      ? `${record.workedHours}h`
      : '—';

  const status = record?.status || (today.onLeave ? 'on_leave' : 'not_checked_in');

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="label-mono">{dateLabel(today.date, { weekday: true })}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text sm:text-[26px]">{headline}</h2>
            {record || today.onLeave ? (
              <Badge tone={tone} dot>
                {statusLabel(status)}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-text-muted">{subline}</p>

          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            <TimeStat label="Check in" value={record?.checkInTime} icon={LogIn} />
            <TimeStat label="Check out" value={record?.checkOutTime} icon={LogOut} />
            <TimeStat label="Worked" value={worked} icon={Timer} />
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-text-faint">
            <Clock size={12} aria-hidden="true" />
            Shift {today.officeStart || '09:00'} · grace {today.graceMinutes ?? 15} min · half day &lt;{' '}
            {today.halfDayHours ?? 5}h
          </p>

          {today.geofence?.lat != null ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-faint">
              <MapPin size={12} aria-hidden="true" />
              {today.geofence.label || 'Office'} · within {today.geofence.radius} m
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {record?.source ? (
              <Badge
                tone={record.source === 'camera' ? 'violet' : record.source === 'correction' ? 'amber' : 'neutral'}
              >
                {titleCase(record.source)}
              </Badge>
            ) : null}
            {record?.faceVerified ? (
              <Badge tone="mint" dot>
                Face verified
              </Badge>
            ) : null}
            {today.canCheckOut ? <Badge tone="cyan">In progress</Badge> : null}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-56">
          {today.canCheckOut ? (
            <Button onClick={onCheckOut} loading={checkOutLoading} icon={LogOut}>
              Check out
            </Button>
          ) : today.canCheckIn ? (
            <Button onClick={onCheckIn} loading={checkInLoading} icon={LogIn}>
              Check in
            </Button>
          ) : (
            <Button disabled icon={Check}>
              Done for today
            </Button>
          )}
          <Button
            variant="secondary"
            icon={Camera}
            onClick={onCamera}
            disabled={!today.canCheckIn || checkInLoading || checkOutLoading}
          >
            Check in with camera
          </Button>
          {geoNote ? (
            <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-amber">
              <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              {geoNote}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function CountsRow({ counts }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Present" value={counts.present} tone="mint" />
      <StatCard label="Late" value={counts.late} tone="amber" />
      <StatCard label="Half days" value={counts.halfDay} tone="amber" />
      <StatCard label="On leave" value={counts.onLeave} tone="violet" />
      <StatCard label="Absent" value={counts.absent} tone="rose" />
      <StatCard
        label="Attendance"
        value={pct(counts.attendanceRate)}
        hint={`${counts.workingDays} working days`}
        tone="cyan"
      />
    </div>
  );
}

/* -------------------------------- calendar -------------------------------- */

function CalendarSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={`c-${i}`} className="aspect-square rounded-md" />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`l-${i}`} className="h-3 w-16" />
        ))}
      </div>
    </div>
  );
}

function CalendarDay({ day }) {
  const label = [dateLabel(day.date, { weekday: true }), statusLabel(day.status)];
  if (day.checkInAt) label.push(`in ${timeLabel(day.checkInAt)}`);
  if (day.checkOutAt) label.push(`out ${timeLabel(day.checkOutAt)}`);
  if (day.workedMinutes) label.push(hoursFromMinutes(day.workedMinutes));
  if (day.leave?.name) label.push(day.leave.name);
  if (day.holidayName) label.push(day.holidayName);
  const title = label.join(' · ');

  return (
    <div
      role="img"
      aria-label={title}
      title={title}
      className={cn(
        'relative flex aspect-square min-w-0 flex-col items-center justify-center rounded-md border text-[11px] leading-none sm:rounded-lg sm:text-[12px]',
        DAY_STYLE[day.status] || DAY_STYLE.not_employed,
      )}
    >
      <span className="font-medium">{Number(day.date.slice(8, 10))}</span>
      {DAY_DOT[day.status] ? (
        <span className={cn('mt-1 h-1 w-1 rounded-full', DAY_DOT[day.status])} aria-hidden="true" />
      ) : null}
    </div>
  );
}

function CalendarGrid({ days, month }) {
  const [y, m] = String(month).split('-').map(Number);
  const firstWeekday = new Date(y, (m || 1) - 1, 1).getDay();

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="pb-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-text-faint sm:text-[10px]"
          >
            {day}
          </div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((day) => (
          <CalendarDay key={day.date} day={day} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5">
        {LEGEND.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className={cn('h-2 w-2 rounded-[3px]', item.swatch)} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- corrections ------------------------------ */

function CorrectionRow({ correction }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-medium text-text">{dateLabel(correction.date, { weekday: true })}</p>
          <StatusBadge status={correction.status} />
        </div>
        <p className="mt-1 text-[12.5px] text-text-muted">
          Requested {correction.requestedCheckIn || '—'} → {correction.requestedCheckOut || '—'}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{correction.reason}</p>
        {correction.comment ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 text-[12px] leading-relaxed text-text-muted">
            <MessageSquare size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            {correction.comment}
          </p>
        ) : null}
      </div>
      <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
        {relativeTime(correction.createdAt)}
      </p>
    </div>
  );
}

/* ----------------------------- camera check-in ---------------------------- */

function CameraCheckInModal({ open, onClose, onSuccess, requiresLocation = false }) {
  const { settings } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camera, setCamera] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [detector, setDetector] = useState(FACE_DETECTOR_SUPPORTED ? 'checking' : 'unsupported');
  const [faces, setFaces] = useState(null);
  const [geo, setGeo] = useState({ status: 'pending', location: null, message: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const maxAccuracy = settings?.maxGpsAccuracy ?? 100;

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setCamera('starting');
    setCameraError('');
    setDetector(FACE_DETECTOR_SUPPORTED ? 'checking' : 'unsupported');
    setFaces(null);
    setError('');
    setGeo({ status: 'pending', location: null, message: '' });

    locate().then((result) => {
      if (!cancelled) setGeo(result);
    });

    (async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setCamera('unsupported');
          setCameraError(
            'This browser does not allow camera access from a web page. Close this and use the normal Check in button.',
          );
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        if (!cancelled) setCamera('live');
      } catch (err) {
        if (cancelled) return;
        setCamera('blocked');
        setCameraError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in your browser, or close this and use the normal Check in button.'
            : err?.name === 'NotFoundError'
              ? 'No camera was found on this device. Close this and use the normal Check in button.'
              : 'We could not start the camera. Close this and use the normal Check in button.',
        );
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream]);

  useEffect(() => {
    if (!open || camera !== 'live' || !FACE_DETECTOR_SUPPORTED) return undefined;
    let active = true;
    let timer = null;
    let instance = null;
    try {
      instance = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
    } catch {
      setDetector('failed');
      return undefined;
    }
    setDetector('ready');

    const tick = async () => {
      if (!active) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const found = await instance.detect(video);
          if (active) setFaces(found.length);
        } catch {
          if (active) {
            setDetector('failed');
            setFaces(null);
            active = false;
            return;
          }
        }
      }
      if (active) timer = setTimeout(tick, 600);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [open, camera]);

  const handleClose = useCallback(() => {
    stopStream();
    setLoading(false);
    onClose();
  }, [onClose, stopStream]);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const faceMode = detector === 'ready';
      const payload = faceMode
        ? { source: 'camera', location: geo.location, faceVerified: true }
        : { source: 'web', location: geo.location, faceVerified: false };
      const result = await post('/attendance/check-in', payload);
      onSuccess(result);
    } catch (err) {
      setError(err.message || 'Check-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const faceMode = detector === 'ready';
  const locationRequired = faceMode || requiresLocation;
  const locationSatisfied = geo.status === 'granted' || !locationRequired;
  const canSubmit =
    camera === 'live' && detector !== 'checking' && geo.status !== 'pending' && locationSatisfied && !loading;

  let faceHint = '';
  let faceHintTone = 'text-text-muted';
  if (detector === 'checking') {
    faceHint = 'Starting face detection…';
  } else if (detector === 'ready') {
    if (faces === 1) {
      faceHint = 'One face detected — ready to check in.';
      faceHintTone = 'text-mint';
    } else if (faces === 0) {
      faceHint = 'No face in frame yet. Look straight at the camera.';
      faceHintTone = 'text-amber';
    } else if (faces != null && faces > 1) {
      faceHint = 'More than one face in frame — only you should be visible.';
      faceHintTone = 'text-amber';
    } else {
      faceHint = 'Looking for your face…';
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Check in with camera"
      description="One face in frame keeps camera check-ins honest. Your location is attached to the record."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} disabled={!canSubmit} icon={Check}>
            {faceMode ? 'Confirm check-in' : 'Check in without face check'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/10 px-3.5 py-3 text-[13px] text-rose"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </div>
        ) : null}

        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-ink-950">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Live camera preview"
            className="h-full w-full -scale-x-100 object-cover"
          />
          {camera !== 'live' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-950/75 px-6 text-center">
              {camera === 'starting' ? (
                <>
                  <Spinner size={20} className="text-cyan" />
                  <p className="text-[12.5px] text-text-muted">Starting your camera…</p>
                </>
              ) : (
                <>
                  <Camera size={22} className="text-text-faint" aria-hidden="true" />
                  <p className="max-w-xs text-[12.5px] leading-relaxed text-text-muted">
                    {cameraError || 'The camera is not available right now.'}
                  </p>
                </>
              )}
            </div>
          ) : null}
          {camera === 'live' && detector === 'ready' ? (
            <div
              className={cn(
                'absolute left-2 top-2 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur',
                faces === 1
                  ? 'border-mint/40 bg-mint/20 text-mint'
                  : 'border-amber/40 bg-amber/20 text-amber',
              )}
            >
              <ScanFace size={13} aria-hidden="true" />
              {faces == null ? 'Scanning…' : `${faces} face${faces === 1 ? '' : 's'}`}
            </div>
          ) : null}
        </div>

        {detector === 'unsupported' || detector === 'failed' ? (
          <div className="flex items-start gap-2 rounded-xl border border-cyan/25 bg-cyan/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-text-muted">
            <Info size={14} className="mt-0.5 shrink-0 text-cyan" aria-hidden="true" />
            <p>
              {detector === 'failed'
                ? 'Face detection could not start in this browser, so we cannot verify a face. This check-in will be saved as a normal web check-in — no face verification is claimed.'
                : 'Face detection is not available in this browser, so we cannot verify a face. This check-in will be saved as a normal web check-in — no face verification is claimed.'}
            </p>
          </div>
        ) : faceHint ? (
          <p className={cn('flex items-center gap-1.5 text-[12.5px]', faceHintTone)}>
            <ScanFace size={13} aria-hidden="true" />
            {faceHint}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12.5px] text-text-muted">
            <MapPin size={13} className="text-cyan" aria-hidden="true" />
            {geo.status === 'pending' ? (
              <>
                Getting your location… <Spinner size={11} />
              </>
            ) : geo.status === 'granted' ? (
              <>GPS accuracy ±{Math.round(geo.location?.accuracy || 0)} m</>
            ) : (
              'No GPS fix'
            )}
          </p>
          {geo.status === 'granted' && Number(geo.location?.accuracy) > maxAccuracy ? (
            <Badge tone="amber">Needs ±{maxAccuracy} m or better</Badge>
          ) : geo.status === 'granted' ? (
            <Badge tone="mint" dot>
              Location on
            </Badge>
          ) : null}
        </div>

        {geo.status !== 'granted' && geo.status !== 'pending' ? (
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-amber">
            <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {locationRequired
                ? 'Location is required for this check-in. Allow location access, then close and reopen this dialog.'
                : geo.message}
            </span>
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/* -------------------------------- staff view ------------------------------ */

function StaffToday() {
  const [date, setDate] = useState(todayKey());
  const [departmentId, setDepartmentId] = useState('');

  const departmentsQuery = useQuery({
    queryKey: ['org', 'departments'],
    queryFn: () => get('/org/departments'),
  });

  const year = date.slice(0, 4);
  const holidaysQuery = useQuery({
    queryKey: ['org', 'holidays', year],
    queryFn: () => get(`/org/holidays?year=${year}`),
  });

  const boardQuery = useQuery({
    queryKey: ['attendance', 'board', date, departmentId],
    queryFn: () =>
      get(`/attendance/board?date=${date}${departmentId ? `&departmentId=${departmentId}` : ''}`),
  });

  const board = boardQuery.data;
  const departments = departmentsQuery.data || [];
  const upcomingHolidays = (holidaysQuery.data || []).filter((holiday) => holiday.date >= date).slice(0, 4);

  const chips = board
    ? [
        { label: 'Present', value: board.summary.present, dot: 'bg-mint', frame: 'border-mint/25 bg-mint/10' },
        { label: 'Late', value: board.summary.late, dot: 'bg-amber', frame: 'border-amber/25 bg-amber/10' },
        { label: 'On leave', value: board.summary.onLeave, dot: 'bg-violet', frame: 'border-violet/25 bg-violet/10' },
        { label: 'Absent', value: board.summary.absent, dot: 'bg-rose', frame: 'border-rose/25 bg-rose/10' },
        { label: 'Half day', value: board.summary.halfDay, dot: 'bg-amber/70', frame: 'border-amber/25 bg-amber/10' },
        {
          label: 'No checkout',
          value: board.summary.missingCheckout,
          dot: 'bg-cyan',
          frame: 'border-cyan/25 bg-cyan/10',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,240px)_auto] sm:items-end">
          <Field label="Board date">
            {(props) => (
              <Input
                {...props}
                type="date"
                max={todayKey()}
                value={date}
                onChange={(event) => setDate(event.target.value || todayKey())}
              />
            )}
          </Field>
          <Field label="Department" hint={departmentsQuery.isError ? 'Departments could not be loaded' : undefined}>
            {(props) => (
              <Select
                {...props}
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                disabled={departmentsQuery.isLoading}
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
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => {
              setDate(todayKey());
              setDepartmentId('');
            }}
          >
            Today
          </Button>
        </div>
      </Card>

      {board?.holiday || board?.isWeekend ? (
        <div
          className={cn(
            'flex items-start gap-2 rounded-xl border px-4 py-3 text-[13px]',
            board?.holiday
              ? 'border-cyan/30 bg-cyan/10 text-cyan-soft'
              : 'border-white/10 bg-white/[0.03] text-text-muted',
          )}
        >
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            {board?.holiday
              ? `${board.holiday} is a holiday — the board is shown for information only.`
              : 'This date is a weekend — the board is shown for information only.'}
          </p>
        </div>
      ) : null}

      {boardQuery.isLoading ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-32 rounded-xl" />
          ))}
        </div>
      ) : chips.length ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <div
              key={chip.label}
              className={cn(
                'flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2',
                chip.frame,
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', chip.dot)} aria-hidden="true" />
              <span className="text-[12px] text-text-muted">{chip.label}</span>
              <span className="font-display text-[15px] font-semibold text-text">{chip.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Daily board"
          subtitle={dateLabel(date, { weekday: true })}
          icon={Users}
          action={
            <IconButton
              label="Refresh board"
              icon={RefreshCw}
              className="h-10 w-10"
              onClick={() => boardQuery.refetch()}
              loading={boardQuery.isFetching}
              disabled={boardQuery.isFetching}
            />
          }
        />
        <div className="p-4 sm:p-5">
          {boardQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : boardQuery.isError ? (
            <ErrorState message={boardQuery.error?.message} onRetry={() => boardQuery.refetch()} />
          ) : !board?.rows?.length ? (
            <EmptyState
              icon={Users}
              title="No employees on this board"
              description="No active employees match this department. Try another department or date."
            />
          ) : (
            <Table caption="Daily attendance board">
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Status</Th>
                  <Th>In</Th>
                  <Th>Out</Th>
                  <Th>Hours</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => (
                  <Tr key={row.employeeId}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={row.fullName} size={30} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-text">{row.fullName}</p>
                          <p className="truncate font-mono text-[10.5px] uppercase tracking-wide text-text-faint">
                            {row.employeeCode}
                            {row.departmentName ? ` · ${row.departmentName}` : ''}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={row.status} />
                        {row.leaveType ? (
                          <span className="text-[11px] text-text-faint">{row.leaveType}</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-[12.5px]">{row.checkInTime || '—'}</Td>
                    <Td className="whitespace-nowrap font-mono text-[12.5px]">{row.checkOutTime || '—'}</Td>
                    <Td className="whitespace-nowrap">
                      {row.workedMinutes ? hoursFromMinutes(row.workedMinutes) : '—'}
                    </Td>
                    <Td>
                      {row.source ? (
                        <Badge
                          tone={
                            row.source === 'camera'
                              ? 'violet'
                              : row.source === 'correction'
                                ? 'amber'
                                : 'neutral'
                          }
                        >
                          {titleCase(row.source)}
                        </Badge>
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

      <Card>
        <CardHeader
          title={`Holidays ${year}`}
          subtitle="Upcoming public and company holidays"
          icon={CalendarDays}
        />
        <div className="p-4 sm:p-5">
          {holidaysQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-11 rounded-lg" />
              ))}
            </div>
          ) : holidaysQuery.isError ? (
            <ErrorState message={holidaysQuery.error?.message} onRetry={() => holidaysQuery.refetch()} />
          ) : upcomingHolidays.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {upcomingHolidays.map((holiday) => (
                <div
                  key={holiday.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-text">{holiday.name}</p>
                    <p className="text-[11.5px] text-text-faint">{dateLabel(holiday.date, { weekday: true })}</p>
                  </div>
                  <Badge tone="cyan">{titleCase(holiday.type)}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming holidays"
              description="Public and company holidays for this year will appear here."
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function StaffCorrections() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState('pending');
  const [comments, setComments] = useState({});

  const correctionsQuery = useQuery({
    queryKey: ['attendance', 'corrections', 'staff'],
    queryFn: () => get('/attendance/corrections'),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision, comment }) => patch(`/attendance/corrections/${id}`, { decision, comment }),
    onSuccess: (_data, variables) => {
      toast.success(
        `Correction ${variables.decision}`,
        variables.decision === 'approved'
          ? 'The attendance record was updated.'
          : 'The employee was notified with your comment.',
      );
      setComments((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => {
      toast.error('Could not save decision', err.message);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  const items = correctionsQuery.data || [];
  const pending = items.filter((item) => item.status === 'pending');
  const decided = items
    .filter((item) => item.status !== 'pending')
    .sort((a, b) => new Date(b.decidedAt || b.createdAt).getTime() - new Date(a.decidedAt || a.createdAt).getTime());
  const list = view === 'pending' ? pending : decided;

  const isDeciding = (id, decision) =>
    decideMutation.isPending &&
    decideMutation.variables?.id === id &&
    decideMutation.variables?.decision === decision;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="overflow-x-auto">
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { value: 'pending', label: 'Pending', count: correctionsQuery.data ? pending.length : undefined },
              { value: 'decided', label: 'Decided', count: correctionsQuery.data ? decided.length : undefined },
            ]}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-10"
          icon={RefreshCw}
          onClick={() => correctionsQuery.refetch()}
          loading={correctionsQuery.isFetching}
          disabled={correctionsQuery.isFetching}
        >
          Refresh
        </Button>
      </div>

      {correctionsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : correctionsQuery.isError ? (
        <Card>
          <ErrorState message={correctionsQuery.error?.message} onRetry={() => correctionsQuery.refetch()} />
        </Card>
      ) : !list.length ? (
        <Card>
          <EmptyState
            icon={view === 'pending' ? Check : ClipboardList}
            title={view === 'pending' ? 'No pending corrections' : 'Nothing decided yet'}
            description={
              view === 'pending'
                ? 'When an employee asks to fix a check-in or check-out, it lands here for approval.'
                : 'Approved and rejected corrections will appear here with their decision notes.'
            }
          />
        </Card>
      ) : view === 'pending' ? (
        <div className="space-y-3">
          {pending.map((item) => (
            <Card key={item.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={item.employeeName || 'Employee'} size={38} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-[15px] font-semibold text-text">
                        {item.employeeName || 'Employee'}
                      </p>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-text-muted">
                      {dateLabel(item.date, { weekday: true })} · requested{' '}
                      <span className="font-mono text-[12px]">
                        {item.requestedCheckIn || '—'} → {item.requestedCheckOut || '—'}
                      </span>
                    </p>
                    <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-text-muted">{item.reason}</p>
                    <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-faint">
                      Requested {relativeTime(item.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="w-full shrink-0 space-y-2 lg:w-72">
                  <Field label="Comment" hint="Recommended — the employee sees it">
                    {(props) => (
                      <Input
                        {...props}
                        value={comments[item.id] || ''}
                        onChange={(event) =>
                          setComments((current) => ({ ...current, [item.id]: event.target.value }))
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
                      loading={isDeciding(item.id, 'approved')}
                      disabled={decideMutation.isPending}
                      onClick={() =>
                        decideMutation.mutate({
                          id: item.id,
                          decision: 'approved',
                          comment: (comments[item.id] || '').trim(),
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      icon={X}
                      loading={isDeciding(item.id, 'rejected')}
                      disabled={decideMutation.isPending}
                      onClick={() =>
                        decideMutation.mutate({
                          id: item.id,
                          decision: 'rejected',
                          comment: (comments[item.id] || '').trim(),
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {decided.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium text-text">
                      {item.employeeName || 'Employee'} · {dateLabel(item.date, { weekday: true })}
                    </p>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 text-[12.5px] text-text-muted">
                    Requested {item.requestedCheckIn || '—'} → {item.requestedCheckOut || '—'}
                  </p>
                  <p className="mt-1 text-[12.5px] text-text-muted">{item.reason}</p>
                  {item.comment ? (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 text-[12px] text-text-muted">
                      <MessageSquare size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {item.comment}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                  {item.decidedAt ? relativeTime(item.decidedAt) : relativeTime(item.createdAt)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
