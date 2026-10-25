import { minutesOfDay, parseTimeToMinutes } from '../utils/date.js';

/**
 * Pure business rules (Section 3 of the brief). No database access here so the
 * rules can be unit tested directly — see server/tests/rules.test.js.
 */

/** Gross = 1.5 × basic (HRA 40% + medical 10% of basic, plus any extras). */
export function computeGross({ basic = 0, houseRentPct = 40, medicalPct = 10, otherAllowances = 0 }) {
  const hra = round(basic * (houseRentPct / 100));
  const medical = round(basic * (medicalPct / 100));
  const gross = round(basic + hra + medical + otherAllowances);
  return { basic: round(basic), hra, medical, otherAllowances: round(otherAllowances), gross };
}

export const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * 'late' when the check-in is after office start + grace window.
 * 09:00 start with 15 minutes of grace => 09:15 is on time, 09:16 is late.
 */
export function classifyCheckIn(checkInAt, officeStart = '09:00', graceMinutes = 15) {
  const limit = parseTimeToMinutes(officeStart) + Number(graceMinutes || 0);
  return minutesOfDay(checkInAt) > limit ? 'late' : 'present';
}

/** Worked minutes between two instants, never negative. */
export function workedMinutes(checkInAt, checkOutAt) {
  if (!checkInAt || !checkOutAt) return 0;
  return Math.max(0, Math.round((new Date(checkOutAt) - new Date(checkInAt)) / 60000));
}

/** Fewer than the half-day threshold (default 5h) makes the day a half day. */
export function isHalfDay(minutes, halfDayHours = 5) {
  return minutes > 0 && minutes < Number(halfDayHours) * 60;
}

/**
 * Section 3 (M5/M6): payroll deducts absent days, unpaid leave days and half of
 * each half day. Optionally 3 lates are treated as 0.5 day.
 */
export function deductionDays({ absentDays = 0, unpaidLeaveDays = 0, halfDays = 0, lateDays = 0, threeLatesEqualsHalfDay = true }) {
  const latePenaltyDays = threeLatesEqualsHalfDay ? Math.floor(lateDays / 3) * 0.5 : 0;
  return {
    absentDays,
    unpaidLeaveDays,
    halfDays: halfDays * 0.5,
    latePenaltyDays,
    totalDays: round(absentDays + unpaidLeaveDays + halfDays * 0.5 + latePenaltyDays),
  };
}

/**
 * Monthly income tax from the configured slabs (illustrative PKR slabs from the
 * brief): 0–600k → 0%; 600k–1.2M → 5%; 1.2M–2.4M → 30k + 15%;
 * 2.4M–3.6M → 210k + 25%; above 3.6M → 510k + 35%.
 */
export function computeTax(monthlyGross, slabs = []) {
  const gross = Number(monthlyGross) || 0;
  if (!slabs.length || gross <= 0) return 0;
  const sorted = [...slabs].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  let previous = 0;
  for (const slab of sorted) {
    const cap = slab.upTo ?? Infinity;
    if (gross <= cap) {
      const taxable = Math.max(0, gross - previous);
      return round(Number(slab.base || 0) + taxable * Number(slab.rate || 0));
    }
    previous = cap;
  }
  return 0;
}

/**
 * Pro-rated gross for someone who joined or left mid-month.
 * eligibleDays = working days they were actually employed for.
 */
export function prorateGross(gross, eligibleDays, workingDays) {
  if (!workingDays) return 0;
  const ratio = Math.min(1, Math.max(0, eligibleDays / workingDays));
  return round(Number(gross || 0) * ratio);
}

/**
 * Attendance rate for a period, per the brief:
 * (present + late + missing_checkout + 0.5 × half_day) / (working-day records − on_leave)
 */
export function attendanceRate(counts) {
  const { present = 0, late = 0, missingCheckout = 0, halfDay = 0, onLeave = 0, workingRecords = 0 } = counts;
  const denominator = workingRecords - onLeave;
  if (denominator <= 0) return 0;
  const numerator = present + late + missingCheckout + 0.5 * halfDay;
  return round(Math.min(1, numerator / denominator) * 100);
}
