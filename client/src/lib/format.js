/** Formatting helpers shared by every screen. */

export const PKR = (value, { compact = false } = {}) => {
  const n = Number(value) || 0;
  if (compact && Math.abs(n) >= 1000) {
    return `PKR ${new Intl.NumberFormat('en-PK', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;
  }
  return `PKR ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(n)}`;
};

export const number = (value) => new Intl.NumberFormat('en-PK').format(Number(value) || 0);

export const pct = (value, digits = 0) => `${(Number(value) || 0).toFixed(digits)}%`;

export const hoursFromMinutes = (minutes) => {
  const m = Number(minutes) || 0;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dateLabel(value, { withYear = true, weekday = false } = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${weekday ? `${DAYS[d.getDay()]} ` : ''}${base}${withYear ? ` ${d.getFullYear()}` : ''}`;
}

export function dateFromKey(key) {
  if (!key) return null;
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function monthLabel(monthKey) {
  if (!monthKey) return '—';
  const [y, m] = String(monthKey).split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

export function timeLabel(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function relativeTime(value) {
  if (!value) return '';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return dateLabel(value);
}

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export const titleCase = (s = '') =>
  String(s)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const todayKey = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export const currentMonth = () => todayKey().slice(0, 7);

export const STATUS_TONE = {
  present: 'mint',
  late: 'amber',
  half_day: 'amber',
  absent: 'rose',
  missing_checkout: 'amber',
  on_leave: 'violet',
  not_checked_in: 'faint',
  weekend: 'faint',
  holiday: 'cyan',
  upcoming: 'faint',
  not_employed: 'faint',
  approved: 'mint',
  pending: 'amber',
  rejected: 'rose',
  cancelled: 'faint',
  draft: 'amber',
  finalized: 'mint',
  active: 'mint',
  probation: 'cyan',
  resigned: 'faint',
  terminated: 'rose',
};

export const statusLabel = (status) =>
  ({
    half_day: 'Half day',
    missing_checkout: 'No checkout',
    on_leave: 'On leave',
    not_checked_in: 'Not checked in',
    not_employed: 'Before joining',
  })[status] || titleCase(status);

export const initialsColor = (name = '') => {
  const palette = ['#7C5CFF', '#22D3EE', '#3DDC97', '#FFB86B', '#FF6B8A', '#A78BFA'];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
};
