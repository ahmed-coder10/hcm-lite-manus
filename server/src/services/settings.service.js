import { all, get, run, nowIso, parseJson } from '../db/index.js';
import { DEFAULT_TAX_SLABS } from '../db/schema.js';
import { conflict } from '../utils/http.js';

const FALLBACK = {
  companyName: 'HCM Lite',
  legalName: '',
  timezone: 'Asia/Karachi',
  currency: 'PKR',
  officeStart: '09:00',
  officeEnd: '18:00',
  graceMinutes: 15,
  halfDayHours: 5,
  workdayHours: 8,
  weekendDays: [6, 0],
  office: { lat: null, lng: null, radius: 150, label: '' },
  maxGpsAccuracy: 100,
  latePenalty: true,
  taxSlabs: DEFAULT_TAX_SLABS,
  setupCompletedAt: null,
};

export function mapSetting(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name,
    legalName: row.legal_name,
    timezone: row.timezone,
    currency: row.currency,
    officeStart: row.office_start,
    officeEnd: row.office_end,
    graceMinutes: row.grace_minutes,
    halfDayHours: row.half_day_hours,
    workdayHours: row.workday_hours,
    weekendDays: parseJson(row.weekend_days, [6, 0]),
    office: {
      lat: row.office_lat,
      lng: row.office_lng,
      radius: row.office_radius,
      label: row.office_label,
    },
    maxGpsAccuracy: row.max_gps_accuracy,
    latePenalty: row.late_penalty === 1,
    taxSlabs: parseJson(row.tax_slabs, DEFAULT_TAX_SLABS),
    setupCompletedAt: row.setup_completed_at,
    updatedAt: row.updated_at,
  };
}

let cache = null;

/**
 * Company settings singleton. Cached in memory and invalidated on write —
 * every rule gets the same numbers for the lifetime of a request.
 */
export const Setting = {
  get() {
    if (cache !== undefined && cache !== null) return cache;
    const row = get('SELECT * FROM settings LIMIT 1');
    cache = row ? mapSetting(row) : null;
    return cache;
  },
  getOrDefault() {
    return this.get() || { ...FALLBACK };
  },
  invalidate() {
    cache = null;
  },
  create({
    companyName,
    legalName = '',
    officeStart = '09:00',
    officeEnd = '18:00',
    graceMinutes = 15,
    halfDayHours = 5,
    workdayHours = 8,
    weekendDays = [6, 0],
    office = {},
    currency = 'PKR',
    timezone = 'Asia/Karachi',
  }) {
    if (get('SELECT id FROM settings LIMIT 1')) throw conflict('Company settings already exist.');
    const id = crypto.randomUUID();
    const now = nowIso();
    run(
      `INSERT INTO settings (id, company_name, legal_name, timezone, currency, office_start, office_end,
         grace_minutes, half_day_hours, workday_hours, weekend_days, office_lat, office_lng, office_radius,
         office_label, max_gps_accuracy, late_penalty, tax_slabs, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, companyName.trim(), legalName, timezone, currency, officeStart, officeEnd,
      graceMinutes, halfDayHours, workdayHours, JSON.stringify(weekendDays),
      office.lat ?? null, office.lng ?? null, office.radius ?? 150, office.label ?? '',
      100, 1, JSON.stringify(DEFAULT_TAX_SLABS), now, now,
    );
    cache = null;
    return this.get();
  },
  update(patch) {
    const current = this.get();
    if (!current) throw conflict('Company settings have not been created yet.');
    const next = {
      companyName: patch.companyName ?? current.companyName,
      legalName: patch.legalName ?? current.legalName,
      officeStart: patch.officeStart ?? current.officeStart,
      officeEnd: patch.officeEnd ?? current.officeEnd,
      graceMinutes: patch.graceMinutes ?? current.graceMinutes,
      halfDayHours: patch.halfDayHours ?? current.halfDayHours,
      workdayHours: patch.workdayHours ?? current.workdayHours,
      weekendDays: patch.weekendDays ?? current.weekendDays,
      office: { ...current.office, ...(patch.office || {}) },
      maxGpsAccuracy: patch.maxGpsAccuracy ?? current.maxGpsAccuracy,
      latePenalty: patch.latePenalty ?? current.latePenalty,
      taxSlabs: patch.taxSlabs ?? current.taxSlabs,
      currency: patch.currency ?? current.currency,
      timezone: patch.timezone ?? current.timezone,
    };
    run(
      `UPDATE settings SET company_name=?, legal_name=?, office_start=?, office_end=?, grace_minutes=?,
        half_day_hours=?, workday_hours=?, weekend_days=?, office_lat=?, office_lng=?, office_radius=?,
        office_label=?, max_gps_accuracy=?, late_penalty=?, tax_slabs=?, currency=?, timezone=?, updated_at=?
       WHERE id = ?`,
      next.companyName, next.legalName, next.officeStart, next.officeEnd, next.graceMinutes,
      next.halfDayHours, next.workdayHours, JSON.stringify(next.weekendDays), next.office.lat,
      next.office.lng, next.office.radius, next.office.label, next.maxGpsAccuracy,
      next.latePenalty ? 1 : 0, JSON.stringify(next.taxSlabs), next.currency, next.timezone,
      nowIso(), current.id,
    );
    cache = null;
    return this.get();
  },
};

/** Public view of the settings for any signed-in user (no tax slabs). */
export function publicSettings() {
  const s = Setting.getOrDefault();
  return {
    companyName: s.companyName,
    legalName: s.legalName,
    officeStart: s.officeStart,
    officeEnd: s.officeEnd,
    graceMinutes: s.graceMinutes,
    halfDayHours: s.halfDayHours,
    workdayHours: s.workdayHours,
    weekendDays: s.weekendDays,
    office: s.office,
    currency: s.currency,
    timezone: s.timezone,
    maxGpsAccuracy: s.maxGpsAccuracy,
    latePenalty: s.latePenalty,
  };
}

export const holidaysInRange = (startKey, endKey) =>
  all('SELECT * FROM holidays WHERE date >= ? AND date <= ? ORDER BY date', startKey, endKey).map((h) => h.date);
