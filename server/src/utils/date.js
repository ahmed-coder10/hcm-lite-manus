import { env } from '../config/env.js';

export const OFFSET_MIN = env.utcOffsetMinutes;
const OFFSET_MS = OFFSET_MIN * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Shifted Date whose UTC getters read as company-local time. */
export const toZoned = (d = new Date()) => new Date(new Date(d).getTime() + OFFSET_MS);

/** 'YYYY-MM-DD' in company-local time. */
export function dateKey(d = new Date()) {
  const z = toZoned(d);
  return `${z.getUTCFullYear()}-${pad(z.getUTCMonth() + 1)}-${pad(z.getUTCDate())}`;
}

/** Local midnight for a 'YYYY-MM-DD' key, as a real UTC instant. */
export function fromKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1) - OFFSET_MS);
}

export const pad = (n) => String(n).padStart(2, '0');

/** Minutes since local midnight. */
export function minutesOfDay(d) {
  const z = toZoned(d);
  return z.getUTCHours() * 60 + z.getUTCMinutes();
}

/** 'HH:MM' local. */
export const timeKey = (d) => {
  if (!d) return null;
  const z = toZoned(d);
  return `${pad(z.getUTCHours())}:${pad(z.getUTCMinutes())}`;
};

export function addDays(d, n) {
  return new Date(new Date(d).getTime() + n * DAY_MS);
}

export function addDaysKey(key, n) {
  return dateKey(addDays(fromKey(key), n));
}

/** ISO weekday: 1=Mon … 7=Sun. */
export function isoWeekday(d) {
  const z = toZoned(d);
  const g = z.getUTCDay(); // 0=Sun
  return g === 0 ? 7 : g;
}

export const isWeekend = (d, weekendDays = [6, 0]) => weekendDays.includes(toZoned(d).getUTCDay());

export function daysBetween(startKey, endKey) {
  return Math.round((fromKey(endKey) - fromKey(startKey)) / DAY_MS) + 1;
}

export function eachDayKey(startKey, endKey) {
  const out = [];
  const total = daysBetween(startKey, endKey);
  if (total <= 0) return out;
  for (let i = 0; i < total; i += 1) out.push(addDaysKey(startKey, i));
  return out;
}

export const monthKey = (d = new Date()) => dateKey(d).slice(0, 7);

export function monthRange(mk) {
  const [y, m] = String(mk).split('-').map(Number);
  const first = `${y}-${pad(m)}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { startKey: first, endKey: `${y}-${pad(m)}-${pad(lastDay)}`, days: lastDay };
}

/**
 * Working days between two local dates (inclusive), skipping weekends and holidays.
 * @param {string[]} holidayKeys - list of 'YYYY-MM-DD'
 */
export function workingDaysInRange(startKey, endKey, weekendDays = [6, 0], holidayKeys = []) {
  const holidays = new Set(holidayKeys);
  return eachDayKey(startKey, endKey).filter(
    (key) => !isWeekend(fromKey(key), weekendDays) && !holidays.has(key),
  );
}

export function parseTimeToMinutes(hhmm) {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const minutesToHours = (min) => Math.round(((min || 0) / 60) * 100) / 100;

export function clampDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
