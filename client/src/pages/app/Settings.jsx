import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2, CalendarDays, Clock, Crosshair, Info, Layers, MapPin, Palmtree, Pencil, Plus,
  Receipt, Save, ShieldCheck, Sparkles, Trash2,
} from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, IconButton,
  Input, Modal, PageHeader, Select, Skeleton, Table, Tabs, Td, Textarea, Th, Tr, cn,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api, del, get, patch, post } from '../../lib/api';
import { PKR, dateLabel, number, pct, relativeTime } from '../../lib/format';

/* --------------------------------- helpers -------------------------------- */

const TABS = [
  { value: 'company', label: 'Company' },
  { value: 'organisation', label: 'Organisation' },
  { value: 'leave', label: 'Leave types' },
  { value: 'holidays', label: 'Holidays' },
];

const DAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const HOLIDAY_TYPES = [
  { value: 'public', label: 'Public holiday' },
  { value: 'company', label: 'Company holiday' },
  { value: 'optional', label: 'Optional holiday' },
];

const HOLIDAY_TONE = { public: 'violet', company: 'cyan', optional: 'neutral' };
const HOLIDAY_LABEL = { public: 'Public', company: 'Company', optional: 'Optional' };

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 3 + i);

/** yyyy-mm-dd plus a minutes-of-day offset -> HH:MM (24h). */
function minutesToTime(total) {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function lateAfter(officeStart, graceMinutes) {
  const [h, m] = String(officeStart || '09:00').split(':').map(Number);
  if (Number.isNaN(h)) return '—';
  return minutesToTime(h * 60 + (m || 0) + (Number(graceMinutes) || 0));
}

function weekendText(days = []) {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sorted = [...new Set(days.map(Number))].sort((a, b) => (a || 7) - (b || 7));
  return sorted.length ? sorted.map((d) => labels[d]).join(', ') : 'none';
}

function formFromSettings(s) {
  return {
    companyName: s.companyName || '',
    legalName: s.legalName || '',
    officeStart: (s.officeStart || '09:00').slice(0, 5),
    officeEnd: (s.officeEnd || '18:00').slice(0, 5),
    graceMinutes: String(s.graceMinutes ?? 15),
    halfDayHours: String(s.halfDayHours ?? 5),
    workdayHours: String(s.workdayHours ?? 8),
    weekendDays: Array.isArray(s.weekendDays) ? s.weekendDays.map(Number) : [6, 0],
    lat: s.office?.lat != null ? String(s.office.lat) : '',
    lng: s.office?.lng != null ? String(s.office.lng) : '',
    radius: String(s.office?.radius ?? 150),
    officeLabel: s.office?.label || '',
    maxGpsAccuracy: String(s.maxGpsAccuracy ?? 100),
    latePenalty: Boolean(s.latePenalty),
  };
}

function validateSettings(f) {
  const e = {};
  if (!f.companyName.trim()) e.companyName = 'Enter the company name';
  else if (f.companyName.trim().length < 2) e.companyName = 'At least 2 characters';

  if (!/^\d{2}:\d{2}$/.test(f.officeStart)) e.officeStart = 'Pick an office start time';
  if (!/^\d{2}:\d{2}$/.test(f.officeEnd)) e.officeEnd = 'Pick an office end time';

  const grace = Number(f.graceMinutes);
  if (f.graceMinutes === '' || Number.isNaN(grace)) e.graceMinutes = 'Enter a grace window';
  else if (grace < 0 || grace > 120) e.graceMinutes = 'Between 0 and 120 minutes';

  const half = Number(f.halfDayHours);
  if (f.halfDayHours === '' || Number.isNaN(half)) e.halfDayHours = 'Enter the half-day threshold';
  else if (half < 1 || half > 12) e.halfDayHours = 'Between 1 and 12 hours';

  const full = Number(f.workdayHours);
  if (f.workdayHours === '' || Number.isNaN(full)) e.workdayHours = 'Enter the full workday length';
  else if (full < 1 || full > 24) e.workdayHours = 'Between 1 and 24 hours';
  else if (!Number.isNaN(half) && full < half) e.workdayHours = 'Must be at least the half-day threshold';

  const radius = Number(f.radius);
  if (f.radius === '' || Number.isNaN(radius)) e.radius = 'Enter a check-in radius';
  else if (radius < 20 || radius > 5000) e.radius = 'Between 20 and 5000 metres';

  const accuracy = Number(f.maxGpsAccuracy);
  if (f.maxGpsAccuracy === '' || Number.isNaN(accuracy)) e.maxGpsAccuracy = 'Enter a maximum accuracy';
  else if (accuracy < 10 || accuracy > 1000) e.maxGpsAccuracy = 'Between 10 and 1000 metres';

  const hasLat = f.lat !== '';
  const hasLng = f.lng !== '';
  if (hasLat !== hasLng) {
    if (!hasLat) e.lat = 'Set a latitude as well';
    if (!hasLng) e.lng = 'Set a longitude as well';
  }
  if (hasLat && (Number.isNaN(Number(f.lat)) || Number(f.lat) < -90 || Number(f.lat) > 90)) {
    e.lat = 'Between -90 and 90';
  }
  if (hasLng && (Number.isNaN(Number(f.lng)) || Number(f.lng) < -180 || Number(f.lng) > 180)) {
    e.lng = 'Between -180 and 180';
  }
  return e;
}

/* ---------------------------------- page ---------------------------------- */

export default function Settings() {
  const [tab, setTab] = useState('company');
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useQuery({
    queryKey: ['org', 'summary'],
    queryFn: () => get('/org/summary'),
  });

  const stats = [
    { label: 'Departments', value: summary?.departments, icon: Building2 },
    { label: 'Designations', value: summary?.designations, icon: Layers },
    { label: 'Leave types', value: summary?.leaveTypes, icon: Palmtree },
    { label: 'Holidays', value: summary?.holidays, icon: CalendarDays },
    { label: 'Active logins', value: summary?.users, icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Company settings"
        description="The rules behind every check-in, leave request and payroll run. Changes apply to every workspace immediately."
      />

      <Card className="p-3">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <span className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-text-faint">
                <s.icon size={13} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <dt className="label-mono truncate">{s.label}</dt>
                <dd className="font-display text-[15px] font-semibold text-text">
                  {summaryLoading || summaryError ? '—' : number(s.value || 0)}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </Card>

      <div className="no-scrollbar -mx-1 overflow-x-auto px-1 pb-1">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'company' ? <CompanyTab /> : null}
      {tab === 'organisation' ? <OrganisationTab /> : null}
      {tab === 'leave' ? <LeaveTypesTab /> : null}
      {tab === 'holidays' ? <HolidaysTab /> : null}
    </div>
  );
}

/* -------------------------------- company --------------------------------- */

function CompanyTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { refreshSession } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['org', 'settings'],
    queryFn: () => get('/org/settings'),
  });

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState(null);

  useEffect(() => {
    if (data) setForm(formFromSettings(data));
  }, [data]);

  const save = useMutation({
    mutationFn: (body) => api('/org/settings', { method: 'PUT', body }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['org', 'settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['org', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['org', 'summary'] });
      setForm(formFromSettings(updated));
      setErrors({});
      toast.success('Company settings saved', 'The new rules apply from the next check-in and payroll run.');
      await refreshSession();
    },
    onError: (err) => {
      const details = err.details || {};
      setErrors({
        ...details,
        lat: details.lat || details['office.lat'],
        lng: details.lng || details['office.lng'],
        radius: details.radius || details['office.radius'],
        officeLabel: details.label || details['office.label'],
      });
      toast.error('Could not save settings', err.message);
    },
  });

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleDay = (value) =>
    setForm((f) => {
      const has = f.weekendDays.includes(value);
      return {
        ...f,
        weekendDays: has ? f.weekendDays.filter((d) => d !== value) : [...f.weekendDays, value].sort((a, b) => a - b),
      };
    });

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.warning('Location not available', 'This browser does not support geolocation.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        setForm((f) => ({
          ...f,
          lat: latitude.toFixed(6),
          lng: longitude.toFixed(6),
        }));
        setAccuracy(Math.round(acc));
        setErrors((e) => ({ ...e, lat: undefined, lng: undefined }));
        setLocating(false);
        toast.success('Location captured', `Accurate to about ${Math.round(acc)} m. Save to apply.`);
      },
      (err) => {
        setLocating(false);
        toast.error(
          'Location unavailable',
          err.code === 1
            ? 'Permission was denied. Allow location access in your browser and try again.'
            : 'Could not read your location. Try again outdoors or type the coordinates manually.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form) return;
    const next = validateSettings(form);
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error('Check the highlighted fields', 'Fix the values marked in red before saving.');
      return;
    }
    save.mutate({
      companyName: form.companyName.trim(),
      legalName: form.legalName.trim(),
      officeStart: form.officeStart,
      officeEnd: form.officeEnd,
      graceMinutes: Number(form.graceMinutes),
      halfDayHours: Number(form.halfDayHours),
      workdayHours: Number(form.workdayHours),
      weekendDays: [...form.weekendDays].sort((a, b) => a - b),
      office: {
        lat: form.lat === '' ? null : Number(form.lat),
        lng: form.lng === '' ? null : Number(form.lng),
        radius: Number(form.radius),
        label: form.officeLabel.trim(),
      },
      maxGpsAccuracy: Number(form.maxGpsAccuracy),
      latePenalty: form.latePenalty,
    });
  };

  if (isError) {
    return (
      <Card>
        <ErrorState message={error?.message} onRetry={refetch} />
      </Card>
    );
  }

  if (isLoading || !form) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-72" />
          <Skeleton className="h-64" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-52" />
          <Skeleton className="h-60" />
        </div>
      </div>
    );
  }

  const taxSlabs = data?.taxSlabs || [];

  return (
    <form onSubmit={submit} noValidate className="grid items-start gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Company identity" subtitle="Shown in the app shell, on payslips and in reports." icon={Building2} />
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" error={errors.companyName} required>
                {(p) => (
                  <Input
                    {...p}
                    value={form.companyName}
                    onChange={(e) => set('companyName', e.target.value)}
                    placeholder="Northwind Labs"
                    autoComplete="organization"
                  />
                )}
              </Field>
              <Field label="Legal name" error={errors.legalName} hint="Optional — printed on payslips.">
                {(p) => (
                  <Input
                    {...p}
                    value={form.legalName}
                    onChange={(e) => set('legalName', e.target.value)}
                    placeholder="Northwind Labs (Pvt) Ltd"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Office start" error={errors.officeStart}>
                {(p) => <Input {...p} type="time" value={form.officeStart} onChange={(e) => set('officeStart', e.target.value)} />}
              </Field>
              <Field label="Office end" error={errors.officeEnd}>
                {(p) => <Input {...p} type="time" value={form.officeEnd} onChange={(e) => set('officeEnd', e.target.value)} />}
              </Field>
            </div>

            <dl className="grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3">
              <div>
                <dt className="label-mono">Timezone</dt>
                <dd className="mt-0.5 text-[12.5px] text-text">{data?.timezone || '—'}</dd>
              </div>
              <div>
                <dt className="label-mono">Currency</dt>
                <dd className="mt-0.5 text-[12.5px] text-text">{data?.currency || '—'}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card>
          <CardHeader title="Working hours" subtitle="Late arrivals, half days and payroll deductions all use these numbers." icon={Clock} />
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Grace window (min)" error={errors.graceMinutes} hint="Start + grace is the cut-off.">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={form.graceMinutes}
                    onChange={(e) => set('graceMinutes', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Half day under (h)" error={errors.halfDayHours} hint="Less than this in a day.">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    max={12}
                    step={0.5}
                    value={form.halfDayHours}
                    onChange={(e) => set('halfDayHours', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Full workday (h)" error={errors.workdayHours}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    value={form.workdayHours}
                    onChange={(e) => set('workdayHours', e.target.value)}
                  />
                )}
              </Field>
            </div>

            <fieldset>
              <legend className="text-[12.5px] font-medium text-text-muted">Weekend days</legend>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {DAY_OPTIONS.map((day) => {
                  const checked = form.weekendDays.includes(day.value);
                  return (
                    <label key={day.value} className="relative block">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={checked}
                        onChange={() => toggleDay(day.value)}
                      />
                      <span
                        className={cn(
                          'flex h-10 w-full cursor-pointer items-center justify-center rounded-xl border text-[12.5px] font-medium transition',
                          checked
                            ? 'border-violet/50 bg-violet/20 text-text'
                            : 'border-white/10 bg-ink-900/60 text-text-muted hover:border-white/20',
                          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan',
                        )}
                      >
                        {day.label}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[12.5px] text-text-faint">
                Attendance, leave and payroll skip these days. {form.weekendDays.length ? '' : 'No weekend selected — every day counts as a working day.'}
              </p>
            </fieldset>

            <div className="border-t border-white/[0.06] pt-4">
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-ink-900/40 px-3.5 py-3 transition hover:border-white/20">
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-text">Late penalty</span>
                  <span className="mt-0.5 block text-[12px] text-text-faint">Every 3 late arrivals add half a day to payroll deductions.</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">{form.latePenalty ? 'On' : 'Off'}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="peer sr-only"
                    checked={form.latePenalty}
                    onChange={(e) => set('latePenalty', e.target.checked)}
                    aria-label="Late penalty"
                  />
                  <span
                    className={cn(
                      'relative h-6 w-11 rounded-full border transition',
                      form.latePenalty ? 'border-violet/40 bg-violet/70' : 'border-white/10 bg-white/10',
                      'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan',
                    )}
                    aria-hidden="true"
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-200',
                        form.latePenalty ? 'translate-x-[22px]' : 'translate-x-0.5',
                      )}
                    />
                  </span>
                </span>
              </label>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Check-in geofence" subtitle="Camera check-ins are only accepted inside this radius." icon={MapPin} />
          <div className="space-y-4 p-5">
            <Button type="button" variant="secondary" icon={Crosshair} loading={locating} onClick={useMyLocation}>
              {locating ? 'Reading your location…' : 'Use my current location'}
            </Button>

            {accuracy != null ? (
              <p className="flex items-center gap-1.5 text-[12px] text-text-faint">
                <Crosshair size={12} aria-hidden="true" />
                Browser accuracy when captured: about {accuracy} m
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Latitude" error={errors.lat} hint="Decimal degrees, e.g. 24.860700">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    step="0.000001"
                    value={form.lat}
                    onChange={(e) => set('lat', e.target.value)}
                    placeholder="24.860700"
                    className="font-mono"
                  />
                )}
              </Field>
              <Field label="Longitude" error={errors.lng} hint="Decimal degrees, e.g. 67.001100">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    step="0.000001"
                    value={form.lng}
                    onChange={(e) => set('lng', e.target.value)}
                    placeholder="67.001100"
                    className="font-mono"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Radius (metres)" error={errors.radius} hint="Between 20 and 5000 m.">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={20}
                    max={5000}
                    step={10}
                    value={form.radius}
                    onChange={(e) => set('radius', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Office label" error={errors.officeLabel} hint="e.g. Head office — Karachi">
                {(p) => (
                  <Input
                    {...p}
                    value={form.officeLabel}
                    onChange={(e) => set('officeLabel', e.target.value)}
                    placeholder="Head office"
                  />
                )}
              </Field>
            </div>

            <Field label="Max GPS accuracy (m)" error={errors.maxGpsAccuracy} hint="Check-ins with a weaker accuracy are rejected.">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={10}
                  max={1000}
                  step={5}
                  value={form.maxGpsAccuracy}
                  onChange={(e) => set('maxGpsAccuracy', e.target.value)}
                />
              )}
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="rounded-lg border border-cyan/25 bg-cyan/10 p-1.5 text-cyan-soft">
              <Sparkles size={15} aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-text">Rule preview</h3>
              <p className="mt-0.5 text-[12.5px] text-text-muted">Live — updates as you edit.</p>
            </div>
          </div>

          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[12.5px] leading-relaxed text-text">
            Late after <span className="font-mono text-cyan-soft">{lateAfter(form.officeStart, form.graceMinutes)}</span>
            {' · '}half day under <span className="font-mono text-text">{form.halfDayHours || '—'}h</span>
            {' · '}weekend <span className="text-text">{weekendText(form.weekendDays)}</span>
            {' · '}check-in radius <span className="font-mono text-text">{form.radius || '—'} m</span>
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
              <dt className="label-mono">Grace</dt>
              <dd className="text-[12.5px] text-text">{form.graceMinutes || 0} min</dd>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
              <dt className="label-mono">GPS accuracy</dt>
              <dd className="text-[12.5px] text-text">≤ {form.maxGpsAccuracy || '—'} m</dd>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
              <dt className="label-mono">Workday</dt>
              <dd className="text-[12.5px] text-text">{form.workdayHours || '—'} h</dd>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
              <dt className="label-mono">Late penalty</dt>
              <dd className="text-[12.5px] text-text">{form.latePenalty ? 'On' : 'Off'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Income tax slabs"
            subtitle="Applied to monthly gross during payroll."
            icon={Receipt}
            action={<Badge tone="faint">Read-only</Badge>}
          />
          <div className="px-2 py-3">
            <Table caption="Income tax slabs">
              <thead>
                <tr>
                  <Th>Up to</Th>
                  <Th className="text-right">Base</Th>
                  <Th className="text-right">Rate</Th>
                </tr>
              </thead>
              <tbody>
                {taxSlabs.length ? (
                  taxSlabs.map((slab, index) => (
                    <Tr key={`${slab.upTo}-${index}`}>
                      <Td className="whitespace-nowrap text-text">
                        {slab.upTo == null ? 'No upper limit' : PKR(slab.upTo)}
                      </Td>
                      <Td className="whitespace-nowrap text-right">{PKR(slab.base)}</Td>
                      <Td className="whitespace-nowrap text-right text-text">{pct((Number(slab.rate) || 0) * 100)}</Td>
                    </Tr>
                  ))
                ) : (
                  <Tr>
                    <Td colSpan={3} className="text-center text-text-faint">No slabs configured.</Td>
                  </Tr>
                )}
              </tbody>
            </Table>
            <p className="flex items-start gap-1.5 px-3 pt-2 text-[11.5px] leading-relaxed text-text-faint">
              <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              Tax slabs are fixed by payroll policy and cannot be edited here.
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display text-[15px] font-semibold text-text">Save changes</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            The next check-in, leave request and payroll run use these rules.
          </p>
          <Button type="submit" size="lg" className="mt-4 w-full" icon={Save} loading={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {data?.updatedAt ? (
            <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
              Updated {relativeTime(data.updatedAt)}
            </p>
          ) : null}
        </Card>
      </div>
    </form>
  );
}

/* ------------------------------- organisation ------------------------------ */

function OrganisationTab() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <DepartmentsCard />
      <DesignationsCard />
    </div>
  );
}

function DepartmentsCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['org', 'departments'],
    queryFn: () => get('/org/departments'),
  });

  const [form, setForm] = useState({ name: '', code: '' });
  const [errors, setErrors] = useState({});
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['org', 'departments'] });
    queryClient.invalidateQueries({ queryKey: ['org', 'summary'] });
  };

  const create = useMutation({
    mutationFn: (body) => post('/org/departments', body),
    onSuccess: (dept) => {
      toast.success('Department added', `${dept.name} is ready to use.`);
      setForm({ name: '', code: '' });
      setErrors({});
      invalidate();
    },
    onError: (err) => {
      setErrors(err.details || {});
      toast.error('Could not add department', err.message);
    },
  });

  const remove = useMutation({
    mutationFn: (id) => del(`/org/departments/${id}`),
    onSuccess: () => {
      toast.success('Department deleted', 'It no longer appears in employee forms.');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => {
      setDeleting(null);
      toast.error('Could not delete department', err.message);
    },
  });

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'At least 2 characters';
    if (form.code.trim() && !/^[A-Za-z0-9_-]{2,12}$/.test(form.code.trim())) {
      next.code = '2–12 letters or digits';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate({ name: form.name.trim(), code: form.code.trim().toUpperCase() });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Departments"
        subtitle="Groups employees for filters, reports and payroll."
        icon={Building2}
        action={<Badge tone="neutral">{data?.length ?? 0}</Badge>}
      />

      <form onSubmit={submit} noValidate className="grid gap-3 border-b border-white/[0.06] px-5 py-4 sm:grid-cols-[1fr_130px_auto]">
        <Field label="Department name" error={errors.name} required>
          {(p) => (
            <Input
              {...p}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Engineering"
            />
          )}
        </Field>
        <Field label="Code" error={errors.code}>
          {(p) => (
            <Input
              {...p}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="ENG"
              maxLength={12}
              className="font-mono uppercase"
            />
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" icon={Plus} loading={create.isPending} className="w-full sm:w-auto">
            Add
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : isError ? (
        <ErrorState message={error?.message} onRetry={refetch} />
      ) : data?.length ? (
        <ul className="divide-y divide-white/[0.05]">
          {data.map((dept) => (
            <li key={dept.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-text-muted">
                <Building2 size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-text">{dept.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-text-faint">
                  <span className="font-mono uppercase tracking-[0.1em]">{dept.code || 'No code'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{number(dept.employeeCount || 0)} employee{dept.employeeCount === 1 ? '' : 's'}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton
                  label={`Edit ${dept.name}`}
                  icon={Pencil}
                  className="h-10 w-10"
                  onClick={() => setEditing(dept)}
                />
                <IconButton
                  label={`Delete ${dept.name}`}
                  icon={Trash2}
                  className="h-10 w-10 text-text-faint hover:text-rose"
                  onClick={() => setDeleting(dept)}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Building2}
          title="No departments yet"
          description="Add the first department so employees can be grouped for filters and reports."
        />
      )}

      <DepartmentEditModal value={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        title="Delete department?"
        description={deleting ? `“${deleting.name}” will be removed. Move its employees to another department first — departments with employees attached cannot be deleted.` : ''}
        confirmLabel="Delete department"
        loading={remove.isPending}
      />
    </Card>
  );
}

function DepartmentEditModal({ value, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (value) {
      setForm({ name: value.name || '', code: value.code || '', description: value.description || '' });
      setErrors({});
    }
  }, [value]);

  const save = useMutation({
    mutationFn: (body) => patch(`/org/departments/${value.id}`, body),
    onSuccess: (dept) => {
      toast.success('Department updated', dept.name);
      onSaved?.();
      onClose();
    },
    onError: (err) => {
      setErrors(err.details || {});
      toast.error('Could not update department', err.message);
    },
  });

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'At least 2 characters';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      description: form.description.trim(),
    });
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title="Edit department"
      description="Rename it or add a description for employee forms."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="department-edit-form" loading={save.isPending}>Save changes</Button>
        </>
      }
    >
      <form id="department-edit-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Department name" error={errors.name} required>
          {(p) => (
            <Input {...p} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          )}
        </Field>
        <Field label="Code" error={errors.code} hint="Short code used on reports.">
          {(p) => (
            <Input
              {...p}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              maxLength={12}
              className="font-mono uppercase"
            />
          )}
        </Field>
        <Field label="Description" error={errors.description}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this team owns"
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}

function DesignationsCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['org', 'designations'],
    queryFn: () => get('/org/designations'),
  });

  const [form, setForm] = useState({ title: '', level: '' });
  const [errors, setErrors] = useState({});
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['org', 'designations'] });
    queryClient.invalidateQueries({ queryKey: ['org', 'summary'] });
  };

  const create = useMutation({
    mutationFn: (body) => post('/org/designations', body),
    onSuccess: (designation) => {
      toast.success('Designation added', designation.title);
      setForm({ title: '', level: '' });
      setErrors({});
      invalidate();
    },
    onError: (err) => {
      setErrors(err.details || {});
      toast.error('Could not add designation', err.message);
    },
  });

  const remove = useMutation({
    mutationFn: (id) => del(`/org/designations/${id}`),
    onSuccess: () => {
      toast.success('Designation deleted', 'It no longer appears in employee forms.');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => {
      setDeleting(null);
      toast.error('Could not delete designation', err.message);
    },
  });

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (form.title.trim().length < 2) next.title = 'At least 2 characters';
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate({ title: form.title.trim(), level: form.level.trim() });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Designations"
        subtitle="Job titles employees can be assigned to."
        icon={Layers}
        action={<Badge tone="neutral">{data?.length ?? 0}</Badge>}
      />

      <form onSubmit={submit} noValidate className="grid gap-3 border-b border-white/[0.06] px-5 py-4 sm:grid-cols-[1fr_130px_auto]">
        <Field label="Job title" error={errors.title} required>
          {(p) => (
            <Input
              {...p}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Software Engineer"
            />
          )}
        </Field>
        <Field label="Level" error={errors.level}>
          {(p) => (
            <Input
              {...p}
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
              placeholder="Senior"
            />
          )}
        </Field>
        <div className="flex items-end">
          <Button type="submit" icon={Plus} loading={create.isPending} className="w-full sm:w-auto">
            Add
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : isError ? (
        <ErrorState message={error?.message} onRetry={refetch} />
      ) : data?.length ? (
        <ul className="divide-y divide-white/[0.05]">
          {data.map((designation) => (
            <li key={designation.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-text-muted">
                <Layers size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-text">{designation.title}</p>
                <p className="mt-0.5 text-[11.5px] text-text-faint">
                  {designation.level ? `Level: ${designation.level}` : 'No level set'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton
                  label={`Edit ${designation.title}`}
                  icon={Pencil}
                  className="h-10 w-10"
                  onClick={() => setEditing(designation)}
                />
                <IconButton
                  label={`Delete ${designation.title}`}
                  icon={Trash2}
                  className="h-10 w-10 text-text-faint hover:text-rose"
                  onClick={() => setDeleting(designation)}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Layers}
          title="No designations yet"
          description="Add job titles so HR can assign them when registering employees."
        />
      )}

      <DesignationEditModal value={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        title="Delete designation?"
        description={deleting ? `“${deleting.title}” will be removed. Designations already assigned to employees cannot be deleted.` : ''}
        confirmLabel="Delete designation"
        loading={remove.isPending}
      />
    </Card>
  );
}

function DesignationEditModal({ value, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', level: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (value) {
      setForm({ title: value.title || '', level: value.level || '' });
      setErrors({});
    }
  }, [value]);

  const save = useMutation({
    mutationFn: (body) => patch(`/org/designations/${value.id}`, body),
    onSuccess: (designation) => {
      toast.success('Designation updated', designation.title);
      onSaved?.();
      onClose();
    },
    onError: (err) => {
      setErrors(err.details || {});
      toast.error('Could not update designation', err.message);
    },
  });

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (form.title.trim().length < 2) next.title = 'At least 2 characters';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ title: form.title.trim(), level: form.level.trim() });
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title="Edit designation"
      description="Update the job title or its level."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="designation-edit-form" loading={save.isPending}>Save changes</Button>
        </>
      }
    >
      <form id="designation-edit-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Job title" error={errors.title} required>
          {(p) => (
            <Input {...p} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          )}
        </Field>
        <Field label="Level" error={errors.level} hint="Optional — e.g. Junior, Senior, Lead.">
          {(p) => (
            <Input {...p} value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} />
          )}
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------- leave types ------------------------------- */

const BLANK_LEAVE_TYPE = {
  name: '',
  code: '',
  annualQuota: '0',
  isPaid: true,
  unlimited: false,
  color: '#7C5CFF',
  requiresReason: true,
};

function CheckRow({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-ink-900/40 px-3.5 py-3 transition hover:border-white/20">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-violet"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-text">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-snug text-text-faint">{hint}</span> : null}
      </span>
    </label>
  );
}

function LeaveTypesTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['org', 'leave-types'],
    queryFn: () => get('/org/leave-types'),
  });

  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['org', 'leave-types'] });
    queryClient.invalidateQueries({ queryKey: ['org', 'summary'] });
  };

  const remove = useMutation({
    mutationFn: (id) => del(`/org/leave-types/${id}`),
    onSuccess: () => {
      toast.success('Leave type deleted', 'It will no longer be offered on leave requests.');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => {
      setDeleting(null);
      toast.error('Could not delete leave type', err.message);
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Leave types"
        subtitle="What employees can request, how much they get and whether it is paid."
        icon={Palmtree}
        action={
          <Button size="md" icon={Plus} onClick={() => setEditor({ mode: 'create' })} className="hidden sm:inline-flex">
            Add leave type
          </Button>
        }
      />

      <div className="p-5">
        <Button size="md" icon={Plus} onClick={() => setEditor({ mode: 'create' })} className="mb-4 w-full sm:hidden">
          Add leave type
        </Button>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : isError ? (
          <ErrorState message={error?.message} onRetry={refetch} />
        ) : data?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((type) => (
              <div key={type.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10"
                      style={{ backgroundColor: type.color || '#7C5CFF' }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium text-text">{type.name}</p>
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-faint">{type.code}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <IconButton
                      label={`Edit ${type.name}`}
                      icon={Pencil}
                      className="h-10 w-10"
                      onClick={() => setEditor({ mode: 'edit', value: type })}
                    />
                    <IconButton
                      label={`Delete ${type.name}`}
                      icon={Trash2}
                      className="h-10 w-10 text-text-faint hover:text-rose"
                      onClick={() => setDeleting(type)}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone={type.isPaid ? 'mint' : 'faint'}>{type.isPaid ? 'Paid' : 'Unpaid'}</Badge>
                  {type.unlimited ? (
                    <Badge tone="cyan">Unlimited</Badge>
                  ) : (
                    <Badge tone="neutral">{number(type.annualQuota)} days / year</Badge>
                  )}
                  {type.requiresReason ? <Badge tone="violet">Reason required</Badge> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Palmtree}
            title="No leave types yet"
            description="Add annual, sick or casual leave so employees can start requesting time off."
            action={<Button icon={Plus} onClick={() => setEditor({ mode: 'create' })}>Add leave type</Button>}
          />
        )}
      </div>

      <LeaveTypeModal
        open={Boolean(editor)}
        mode={editor?.mode}
        value={editor?.value}
        onClose={() => setEditor(null)}
        onSaved={invalidate}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        title="Delete leave type?"
        description={deleting ? `“${deleting.name}” will be removed from the leave request form. Types that already have leave requests against them cannot be deleted.` : ''}
        confirmLabel="Delete leave type"
        loading={remove.isPending}
      />
    </Card>
  );
}

function LeaveTypeModal({ open, mode, value, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(BLANK_LEAVE_TYPE);
  const [errors, setErrors] = useState({});
  const isEdit = mode === 'edit' && Boolean(value?.id);

  useEffect(() => {
    if (!open) return;
    if (value) {
      setForm({
        name: value.name || '',
        code: value.code || '',
        annualQuota: String(value.annualQuota ?? 0),
        isPaid: Boolean(value.isPaid),
        unlimited: Boolean(value.unlimited),
        color: value.color || '#7C5CFF',
        requiresReason: Boolean(value.requiresReason),
      });
    } else {
      setForm(BLANK_LEAVE_TYPE);
    }
    setErrors({});
  }, [open, value]);

  const save = useMutation({
    mutationFn: (body) => (isEdit ? patch(`/org/leave-types/${value.id}`, body) : post('/org/leave-types', body)),
    onSuccess: (type) => {
      toast.success(isEdit ? 'Leave type updated' : 'Leave type added', type.name);
      onSaved?.();
      onClose();
    },
    onError: (err) => {
      setErrors(err.details || {});
      toast.error(isEdit ? 'Could not update leave type' : 'Could not add leave type', err.message);
    },
  });

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'At least 2 characters';
    if (!/^[A-Za-z0-9_-]{2,12}$/.test(form.code.trim())) next.code = '2–12 letters or digits';
    const quota = Number(form.annualQuota);
    if (!form.unlimited && (form.annualQuota === '' || Number.isNaN(quota) || quota < 0)) {
      next.annualQuota = 'Enter 0 or more days';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      annualQuota: Number(form.annualQuota || 0),
      isPaid: form.isPaid,
      unlimited: form.unlimited,
      color: form.color,
      requiresReason: form.requiresReason,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit leave type' : 'New leave type'}
      description={isEdit ? 'Changes apply to new leave requests.' : 'Employees will see this on the leave request form.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="leave-type-form" loading={save.isPending}>
            {isEdit ? 'Save changes' : 'Create leave type'}
          </Button>
        </>
      }
    >
      <form id="leave-type-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Name" error={errors.name} required>
          {(p) => (
            <Input
              {...p}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Annual Leave"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Code"
            error={errors.code}
            hint={isEdit ? 'Codes cannot be changed after creation.' : 'Short code, e.g. ANNUAL.'}
            required
          >
            {(p) => (
              <Input
                {...p}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                maxLength={12}
                disabled={isEdit}
                className="font-mono uppercase"
                placeholder="ANNUAL"
              />
            )}
          </Field>
          <Field label="Annual quota (days)" error={errors.annualQuota} hint="Ignored when unlimited.">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                max={365}
                step={1}
                value={form.annualQuota}
                onChange={(e) => setForm((f) => ({ ...f, annualQuota: e.target.value }))}
                disabled={form.unlimited}
              />
            )}
          </Field>
        </div>

        <Field label="Colour" error={errors.color} hint="Used on leave cards and the calendar.">
          {(p) => (
            <div className="flex items-center gap-3">
              <input
                id={p.id}
                aria-describedby={p['aria-describedby']}
                aria-invalid={Boolean(errors.color) || undefined}
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-11 w-16 cursor-pointer rounded-xl border border-white/10 bg-ink-900/60 p-1"
              />
              <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-muted">{form.color}</span>
            </div>
          )}
        </Field>

        <div className="space-y-2">
          <CheckRow
            label="Paid leave"
            hint="Unpaid leave is deducted from payroll."
            checked={form.isPaid}
            onChange={(checked) => setForm((f) => ({ ...f, isPaid: checked }))}
          />
          <CheckRow
            label="Unlimited leave"
            hint="No annual quota and no balance tracking."
            checked={form.unlimited}
            onChange={(checked) => setForm((f) => ({ ...f, unlimited: checked }))}
          />
          <CheckRow
            label="Requires a reason"
            hint="Employees must explain the request."
            checked={form.requiresReason}
            onChange={(checked) => setForm((f) => ({ ...f, requiresReason: checked }))}
          />
        </div>
      </form>
    </Modal>
  );
}

/* --------------------------------- holidays -------------------------------- */

function HolidaysTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [form, setForm] = useState({ name: '', date: '', type: 'public' });
  const [errors, setErrors] = useState({});
  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['org', 'holidays', year],
    queryFn: () => get(`/org/holidays?year=${year}`),
  });

  const grouped = useMemo(() => {
    const map = new Map();
    [...(data || [])]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .forEach((holiday) => {
        const month = Number(String(holiday.date).slice(5, 7));
        if (!map.has(month)) map.set(month, []);
        map.get(month).push(holiday);
      });
    return [...map.entries()].map(([month, items]) => ({
      month,
      label: `${MONTH_FULL[month - 1] || 'Unknown'} ${year}`,
      items,
    }));
  }, [data, year]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['org', 'holidays'] });
    queryClient.invalidateQueries({ queryKey: ['org', 'summary'] });
  };

  const create = useMutation({
    mutationFn: (body) => post('/org/holidays', body),
    onSuccess: (holiday) => {
      toast.success('Holiday added', `${holiday.name} · ${dateLabel(holiday.date)}`);
      setForm({ name: '', date: '', type: 'public' });
      setErrors({});
      invalidate();
    },
    onError: (err) => {
      setErrors(err.details || {});
      toast.error('Could not add holiday', err.message);
    },
  });

  const remove = useMutation({
    mutationFn: (id) => del(`/org/holidays/${id}`),
    onSuccess: () => {
      toast.success('Holiday removed', 'Attendance and payroll now treat that day as normal.');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => {
      setDeleting(null);
      toast.error('Could not remove holiday', err.message);
    },
  });

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Give the holiday a name';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) next.date = 'Pick a date';
    else if (!form.date.startsWith(`${year}-`)) next.date = `Pick a date in ${year}`;
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate({ name: form.name.trim(), date: form.date, type: form.type });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Add a holiday" subtitle="Holidays are excluded from working days, attendance and payroll." icon={CalendarDays} />
        <form onSubmit={submit} noValidate className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_170px_170px_auto]">
          <Field label="Holiday name" error={errors.name} required>
            {(p) => (
              <Input
                {...p}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Eid ul Fitr"
              />
            )}
          </Field>
          <Field label="Date" error={errors.date} required>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={form.date}
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            )}
          </Field>
          <Field label="Type" error={errors.type}>
            {(p) => (
              <Select {...p} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {HOLIDAY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex items-end">
            <Button type="submit" icon={Plus} loading={create.isPending} className="w-full lg:w-auto">
              Add holiday
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title={`Holidays in ${year}`}
          subtitle={`${number(data?.length || 0)} day${data?.length === 1 ? '' : 's'} configured`}
          icon={CalendarDays}
          action={
            <div className="flex items-center gap-2">
              <label htmlFor="holiday-year" className="text-[12.5px] text-text-muted">Year</label>
              <div className="w-[104px]">
                <Select
                  id="holiday-year"
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setErrors({});
                    setForm((f) => ({ ...f, date: '' }));
                  }}
                >
                  {YEAR_OPTIONS.map((option) => (
                    <option key={option} value={String(option)}>{option}</option>
                  ))}
                </Select>
              </div>
            </div>
          }
        />

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : isError ? (
          <ErrorState message={error?.message} onRetry={refetch} />
        ) : grouped.length ? (
          <div>
            {grouped.map((group) => (
              <section key={group.month} aria-label={group.label}>
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] bg-white/[0.02] px-5 py-2">
                  <p className="label-mono">{group.label}</p>
                  <p className="text-[11.5px] text-text-faint">{group.items.length} day{group.items.length === 1 ? '' : 's'}</p>
                </div>
                <ul className="divide-y divide-white/[0.04]">
                  {group.items.map((holiday) => (
                    <li key={holiday.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03]">
                        <span className="font-display text-[13px] font-semibold leading-none text-text">
                          {Number(String(holiday.date).slice(8, 10))}
                        </span>
                        <span className="mt-0.5 font-mono text-[9px] uppercase leading-none text-text-faint">
                          {MONTH_FULL[Number(String(holiday.date).slice(5, 7)) - 1]?.slice(0, 3)}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-text">{holiday.name}</p>
                        <p className="mt-0.5 text-[11.5px] text-text-faint">{dateLabel(holiday.date, { weekday: true })}</p>
                      </div>
                      <Badge tone={HOLIDAY_TONE[holiday.type] || 'neutral'}>{HOLIDAY_LABEL[holiday.type] || holiday.type}</Badge>
                      <IconButton
                        label={`Remove ${holiday.name}`}
                        icon={Trash2}
                        className="h-10 w-10 text-text-faint hover:text-rose"
                        onClick={() => setDeleting(holiday)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={`No holidays in ${year}`}
            description="Add public and company holidays above — they are skipped when working days are counted."
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        title="Remove holiday?"
        description={deleting ? `“${deleting.name}” on ${dateLabel(deleting.date)} will be removed. That day becomes a normal working day again.` : ''}
        confirmLabel="Remove holiday"
        loading={remove.isPending}
      />
    </div>
  );
}
