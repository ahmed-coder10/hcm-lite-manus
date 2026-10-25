import { all, get, run, nowIso } from '../db/index.js';
import { HttpError, conflict, notFound, unprocessable } from '../utils/http.js';
import {
  dateKey, fromKey, monthRange, eachDayKey, isWeekend, workingDaysInRange,
  timeKey, parseTimeToMinutes, minutesToHours, addDaysKey,
} from '../utils/date.js';
import { withinRadius, validCoord } from '../utils/geo.js';
import { classifyCheckIn, workedMinutes as workedMinutesBetween, isHalfDay, attendanceRate } from '../domain/rules.js';
import { Setting } from './settings.service.js';
import { notifyEmployee } from './notify.service.js';

export const mapAttendance = (row) =>
  row && {
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    checkInTime: timeKey(row.check_in_at),
    checkOutTime: timeKey(row.check_out_at),
    status: row.status,
    workedMinutes: row.worked_minutes,
    workedHours: minutesToHours(row.worked_minutes),
    source: row.source,
    faceVerified: row.face_verified === 1,
    checkInLocation: row.in_lat != null ? { lat: row.in_lat, lng: row.in_lng, accuracy: row.in_accuracy, distance: row.in_distance } : null,
    checkOutLocation: row.out_lat != null ? { lat: row.out_lat, lng: row.out_lng, accuracy: row.out_accuracy, distance: row.out_distance } : null,
    note: row.note,
  };

export const todayRecord = (employeeId, key = dateKey()) =>
  get('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', employeeId, key);

const holidayKeysBetween = (startKey, endKey) =>
  new Set(all('SELECT date FROM holidays WHERE date >= ? AND date <= ?', startKey, endKey).map((h) => h.date));

/** Approved leave days (working days only) keyed by date for one employee. */
function leaveDaysMap(employeeId, startKey, endKey) {
  const rows = all(
    `SELECT lr.start_date, lr.end_date, lt.name, lt.is_paid, lt.color
     FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE lr.employee_id = ? AND lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?`,
    employeeId, endKey, startKey,
  );
  const map = new Map();
  for (const r of rows) {
    for (const key of eachDayKey(r.start_date, r.end_date)) {
      if (key < startKey || key > endKey) continue;
      map.set(key, { name: r.name, isPaid: r.is_paid === 1, color: r.color });
    }
  }
  return map;
}

/**
 * Full day-by-day picture for one employee. Used by the calendar, the payroll
 * engine and the dashboards so every number agrees.
 */
export function employeeAttendance(employeeId, startKey, endKey, options = {}) {
  const settings = options.settings || Setting.getOrDefault();
  const holidaysInput = options.holidays || holidayKeysBetween(startKey, endKey);
  // Callers pass either a Set of keys or a Map of key -> holiday name.
  const holidayMap = holidaysInput instanceof Map ? holidaysInput : new Set(holidaysInput);
  const isHoliday = (key) => holidayMap.has(key);
  const holidayName = (key) => (holidayMap instanceof Map ? holidayMap.get(key) : undefined);
  const leaves = options.leaves || leaveDaysMap(employeeId, startKey, endKey);
  const employee = options.employee || get('SELECT * FROM employees WHERE id = ?', employeeId);
  if (!employee) throw notFound('Employee not found.');

  const records = new Map(
    all('SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?', employeeId, startKey, endKey)
      .map((r) => [r.date, r]),
  );

  const joinKey = (employee.join_date || '').slice(0, 10);
  const exitKey = employee.exit_date ? employee.exit_date.slice(0, 10) : null;
  const today = dateKey();
  const days = [];

  for (const key of eachDayKey(startKey, endKey)) {
    const record = records.get(key);
    const leave = leaves.get(key);
    const employed = key >= joinKey && (!exitKey || key <= exitKey);
    const weekend = isWeekend(fromKey(key), settings.weekendDays);
    const holiday = isHoliday(key);

    let status;
    if (!employed) status = 'not_employed';
    else if (record && record.check_in_at) {
      if (record.status === 'half_day') status = 'half_day';
      else if (!record.check_out_at && key < today) status = 'missing_checkout';
      else if (!record.check_out_at && key === today) status = record.status === 'late' ? 'late' : 'present';
      else status = record.status;
    } else if (leave) status = 'on_leave';
    else if (weekend) status = 'weekend';
    else if (holiday) status = 'holiday';
    else if (key > today) status = 'upcoming';
    else if (key === today) status = 'not_checked_in';
    else status = 'absent';

    days.push({
      date: key,
      status,
      weekend,
      holiday: holiday ? holidayName(key) || true : false,
      leave: leave || null,
      checkInAt: record ? record.check_in_at : null,
      checkOutAt: record ? record.check_out_at : null,
      workedMinutes: record ? record.worked_minutes : 0,
      late: status === 'late' || (record ? record.status === 'late' : false),
      recordId: record ? record.id : null,
      source: record ? record.source : null,
    });
  }

  const count = (s) => days.filter((d) => d.status === s).length;
  const workingRecords = days.filter((d) => !d.weekend && !d.holiday && d.status !== 'not_employed' && d.status !== 'upcoming');
  const counts = {
    present: count('present'),
    late: count('late'),
    halfDay: count('half_day'),
    missingCheckout: count('missing_checkout'),
    absent: count('absent'),
    onLeave: count('on_leave'),
    notCheckedIn: count('not_checked_in'),
    workingDays: workingRecords.filter((d) => !['on_leave'].includes(d.status)).length,
    totalMinutes: days.reduce((sum, d) => sum + (d.workedMinutes || 0), 0),
  };
  counts.attendanceRate = attendanceRate({
    present: counts.present,
    late: counts.late,
    missingCheckout: counts.missingCheckout,
    halfDay: counts.halfDay,
    onLeave: counts.onLeave,
    workingRecords: workingRecords.length,
  });

  return { days, counts, employee };
}

/** Month calendar for one employee (the screen the brief asks for). */
export function attendanceCalendar(employeeId, month) {
  const { startKey, endKey } = monthRange(month);
  const settings = Setting.getOrDefault();
  const holidaysRows = all('SELECT * FROM holidays WHERE date >= ? AND date <= ?', startKey, endKey);
  const holidays = new Map(holidaysRows.map((h) => [h.date, h.name]));
  const { days, counts } = employeeAttendance(employeeId, startKey, endKey, {
    settings,
    holidays: new Set(holidaysRows.map((h) => h.date)),
  });
  return {
    month,
    days: days.map((d) => ({ ...d, holidayName: typeof d.holiday === 'string' ? d.holiday : holidays.get(d.date) || null })),
    counts,
  };
}

/* ------------------------------- check in/out ------------------------------ */

function geofence(settings, location, source) {
  const office = settings.office || {};
  const hasOffice = validCoord(office.lat, office.lng);
  if (!hasOffice) {
    return { distance: null, allowed: true, configured: false };
  }
  if (!location) {
    return { distance: null, allowed: false, configured: true, reason: 'Location is required for this check-in.' };
  }
  const { allowed, distance } = withinRadius(location, { lat: office.lat, lng: office.lng }, office.radius);
  return { distance, allowed, configured: true, radius: office.radius };
}

/**
 * Server stamps the time. One record per employee per day: a second check-in
 * returns 409 (brief, M4). Camera check-ins must have exactly one face, a GPS
 * fix better than 100 m and be inside the office radius.
 */
export function checkIn({ employeeId, source = 'web', location = null, faceVerified = false, ip = '', userAgent = '' }) {
  const settings = Setting.getOrDefault();
  const key = dateKey();
  const now = new Date();
  const existing = todayRecord(employeeId, key);
  if (existing && existing.check_in_at) {
    throw conflict('You already checked in today.', { checkInAt: existing.check_in_at });
  }

  if (source === 'camera') {
    if (!faceVerified) {
      throw unprocessable('No face detected. Look straight at the camera and try again.');
    }
    if (!location) throw unprocessable('Turn on location to check in with the camera.');
    if (location.accuracy && location.accuracy > settings.maxGpsAccuracy) {
      throw unprocessable(`GPS accuracy is ${Math.round(location.accuracy)} m — needs to be under ${settings.maxGpsAccuracy} m. Move somewhere with a clearer signal.`);
    }
  }

  const geo = geofence(settings, location, source);
  if ((source === 'camera' || geo.configured) && location && !geo.allowed) {
    throw unprocessable(
      `You are ${geo.distance} m from the office — check-in needs to be within ${geo.radius} m.`,
    );
  }

  const status = classifyCheckIn(now, settings.officeStart, settings.graceMinutes);
  const values = [
    location ? location.lat : null, location ? location.lng : null,
    location ? location.accuracy ?? null : null, geo.distance,
    ip, userAgent,
  ];

  if (existing) {
    run(
      `UPDATE attendance SET check_in_at=?, status=?, source=?, face_verified=?, in_lat=?, in_lng=?,
        in_accuracy=?, in_distance=?, in_ip=?, in_ua=?, updated_at=? WHERE id=?`,
      now.toISOString(), status, source, faceVerified ? 1 : 0, ...values, nowIso(), existing.id,
    );
    return { record: mapAttendance(todayRecord(employeeId, key)), late: status === 'late', distance: geo.distance };
  }

  run(
    `INSERT INTO attendance (id, employee_id, date, check_in_at, status, source, face_verified,
       in_lat, in_lng, in_accuracy, in_distance, in_ip, in_ua, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    crypto.randomUUID(), employeeId, key, now.toISOString(), status, source, faceVerified ? 1 : 0,
    ...values, nowIso(), nowIso(),
  );
  return { record: mapAttendance(todayRecord(employeeId, key)), late: status === 'late', distance: geo.distance };
}

export function checkOut({ employeeId, source = 'web', location = null, ip = '', userAgent = '' }) {
  const settings = Setting.getOrDefault();
  const key = dateKey();
  const record = todayRecord(employeeId, key);
  if (!record || !record.check_in_at) throw unprocessable('Check in first, then check out.');
  if (record.check_out_at) throw conflict('You already checked out today.', { checkOutAt: record.check_out_at });

  const now = new Date();
  const minutes = workedMinutesBetween(record.check_in_at, now);
  const status = isHalfDay(minutes, settings.halfDayHours) ? 'half_day' : record.status === 'late' ? 'late' : 'present';

  run(
    `UPDATE attendance SET check_out_at=?, worked_minutes=?, status=?, out_lat=?, out_lng=?,
       out_accuracy=?, out_distance=?, out_ip=?, out_ua=?, updated_at=? WHERE id=?`,
    now.toISOString(), minutes, status,
    location ? location.lat : null, location ? location.lng : null,
    location ? location.accuracy ?? null : null, null, ip, userAgent, nowIso(), record.id,
  );
  return {
    record: mapAttendance(todayRecord(employeeId, key)),
    workedMinutes: minutes,
    halfDay: status === 'half_day',
    message: status === 'half_day'
      ? `Checked out after ${minutesToHours(minutes)}h — under ${settings.halfDayHours}h counts as a half day.`
      : `Checked out after ${minutesToHours(minutes)}h.`,
  };
}

/** HR daily attendance board: every active employee for one date. */
export function dailyBoard(key = dateKey(), { departmentId = null } = {}) {
  const settings = Setting.getOrDefault();
  const weekend = isWeekend(fromKey(key), settings.weekendDays);
  const holiday = get('SELECT name FROM holidays WHERE date = ?', key);

  const employees = all(
    `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.email, e.status AS employee_status,
            e.join_date, e.exit_date, d.name AS department_name, d.id AS department_id
     FROM employees e LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.status IN ('active','probation') ${departmentId ? 'AND e.department_id = ?' : ''}
     ORDER BY e.first_name`,
    ...(departmentId ? [departmentId] : []),
  );

  const rows = employees.map((e) => {
    const rec = get('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', e.id, key);
    const leave = get(
      `SELECT lt.name FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.employee_id = ? AND lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ? LIMIT 1`,
      e.id, key, key,
    );
    const employed = key >= e.join_date.slice(0, 10) && (!e.exit_date || key <= e.exit_date.slice(0, 10));
    let status;
    if (!employed) status = 'not_employed';
    else if (rec && rec.check_in_at) {
      if (rec.status === 'half_day') status = 'half_day';
      else if (!rec.check_out_at) status = 'missing_checkout';
      else status = rec.status;
    } else if (leave) status = 'on_leave';
    else if (holiday) status = 'holiday';
    else if (weekend) status = 'weekend';
    else status = 'absent';

    return {
      employeeId: e.id,
      employeeCode: e.employee_code,
      fullName: `${e.first_name} ${e.last_name}`,
      departmentId: e.department_id,
      departmentName: e.department_name,
      status,
      leaveType: leave ? leave.name : null,
      checkInAt: rec ? rec.check_in_at : null,
      checkOutAt: rec ? rec.check_out_at : null,
      checkInTime: rec ? timeKey(rec.check_in_at) : null,
      checkOutTime: rec ? timeKey(rec.check_out_at) : null,
      workedMinutes: rec ? rec.worked_minutes : 0,
      source: rec ? rec.source : null,
    };
  });

  return {
    date: key,
    isWeekend: weekend,
    holiday: holiday ? holiday.name : null,
    summary: {
      present: rows.filter((r) => ['present', 'late'].includes(r.status)).length,
      late: rows.filter((r) => r.status === 'late').length,
      onLeave: rows.filter((r) => r.status === 'on_leave').length,
      absent: rows.filter((r) => r.status === 'absent').length,
      halfDay: rows.filter((r) => r.status === 'half_day').length,
      missingCheckout: rows.filter((r) => r.status === 'missing_checkout').length,
    },
    rows,
  };
}

/** Company / department attendance summary for a date range. */
export function attendanceSummary({ startKey, endKey, departmentId = null }) {
  const settings = Setting.getOrDefault();
  const employees = all(
    `SELECT * FROM employees WHERE status IN ('active','probation') ${departmentId ? 'AND department_id = ?' : ''}`,
    ...(departmentId ? [departmentId] : []),
  );
  const holidays = holidayKeysBetween(startKey, endKey);
  const totals = {
    present: 0, late: 0, halfDay: 0, missingCheckout: 0, absent: 0, onLeave: 0, workingDays: 0, totalMinutes: 0,
  };
  const perEmployee = [];

  for (const employee of employees) {
    const { counts } = employeeAttendance(employee.id, startKey, endKey, { settings, holidays, employee });
    totals.present += counts.present;
    totals.late += counts.late;
    totals.halfDay += counts.halfDay;
    totals.missingCheckout += counts.missingCheckout;
    totals.absent += counts.absent;
    totals.onLeave += counts.onLeave;
    totals.workingDays += counts.workingDays;
    totals.totalMinutes += counts.totalMinutes;
    perEmployee.push({ employeeId: employee.id, ...counts });
  }

  const workingRecords = totals.present + totals.late + totals.halfDay + totals.missingCheckout + totals.absent;
  return {
    range: { startKey, endKey },
    ...totals,
    attendanceRate: attendanceRate({
      present: totals.present,
      late: totals.late,
      missingCheckout: totals.missingCheckout,
      halfDay: totals.halfDay,
      onLeave: totals.onLeave,
      workingRecords,
    }),
    perEmployee,
  };
}

/** Late count for one employee in a month (used by payroll + dashboards). */
export const lateCount = (employeeId, startKey, endKey) =>
  get(
    "SELECT count(*) AS c FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? AND status = 'late'",
    employeeId, startKey, endKey,
  ).c;

/* ------------------------------ corrections -------------------------------- */

export function requestCorrection({ employeeId, date, requestedCheckIn, requestedCheckOut, reason }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw unprocessable('Pick the date to correct.');
  if (!reason || reason.trim().length < 5) throw unprocessable('Please explain what needs fixing.');
  if (date > dateKey()) throw unprocessable('You cannot correct a future date.');
  const pending = get(
    "SELECT id FROM attendance_corrections WHERE employee_id = ? AND date = ? AND status = 'pending'",
    employeeId, date,
  );
  if (pending) throw conflict('You already have a pending correction for that date.');
  if (requestedCheckIn && requestedCheckOut && parseTimeToMinutes(requestedCheckOut) <= parseTimeToMinutes(requestedCheckIn)) {
    throw unprocessable('Check-out must be after check-in.');
  }
  const rec = get('SELECT id FROM attendance WHERE employee_id = ? AND date = ?', employeeId, date);
  const id = crypto.randomUUID();
  run(
    `INSERT INTO attendance_corrections (id, employee_id, date, attendance_id, requested_check_in,
       requested_check_out, reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    id, employeeId, date, rec ? rec.id : null, requestedCheckIn || '', requestedCheckOut || '',
    reason.trim(), nowIso(), nowIso(),
  );
  return mapCorrection(get('SELECT * FROM attendance_corrections WHERE id = ?', id));
}

export const mapCorrection = (row) =>
  row && {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || null,
    date: row.date,
    requestedCheckIn: row.requested_check_in,
    requestedCheckOut: row.requested_check_out,
    reason: row.reason,
    status: row.status,
    comment: row.comment,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };

export function listCorrections({ employeeId = null, status = null, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (employeeId) { where.push('c.employee_id = ?'); params.push(employeeId); }
  if (status) { where.push('c.status = ?'); params.push(status); }
  return all(
    `SELECT c.*, (e.first_name || ' ' || e.last_name) AS employee_name
     FROM attendance_corrections c JOIN employees e ON e.id = c.employee_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY c.created_at DESC LIMIT ?`,
    ...params, Math.min(200, Number(limit) || 50),
  ).map(mapCorrection);
}

export function decideCorrection({ id, decision, comment = '', actorUserId }) {
  const row = get(
    `SELECT c.*, (e.first_name || ' ' || e.last_name) AS employee_name
     FROM attendance_corrections c JOIN employees e ON e.id = c.employee_id WHERE c.id = ?`,
    id,
  );
  if (!row) throw notFound('Correction request not found.');
  if (row.status !== 'pending') throw conflict('This correction has already been decided.');

  if (decision === 'approved') {
    const settings = Setting.getOrDefault();
    const inMin = row.requested_check_in ? parseTimeToMinutes(row.requested_check_in) : null;
    const outMin = row.requested_check_out ? parseTimeToMinutes(row.requested_check_out) : null;
    const base = fromKey(row.date);
    const checkInAt = inMin != null ? new Date(base.getTime() + inMin * 60000).toISOString() : null;
    const checkOutAt = outMin != null ? new Date(base.getTime() + outMin * 60000).toISOString() : null;
    const worked = checkInAt && checkOutAt ? Math.max(0, outMin - inMin) : 0;
    const status = worked && isHalfDay(worked, settings.halfDayHours)
      ? 'half_day'
      : checkInAt
        ? classifyCheckIn(checkInAt, settings.officeStart, settings.graceMinutes)
        : 'present';

    const existing = get('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', row.employee_id, row.date);
    if (existing) {
      run(
        `UPDATE attendance SET check_in_at = coalesce(?, check_in_at), check_out_at = coalesce(?, check_out_at),
           worked_minutes = ?, status = ?, source = 'correction', note = ?, corrected_by = ?, updated_at = ?
         WHERE id = ?`,
        checkInAt, checkOutAt, worked, status, `Corrected: ${row.reason}`, actorUserId, nowIso(), existing.id,
      );
    } else if (checkInAt) {
      run(
        `INSERT INTO attendance (id, employee_id, date, check_in_at, check_out_at, worked_minutes, status, source,
           note, corrected_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,'correction',?,?,?,?)`,
        crypto.randomUUID(), row.employee_id, row.date, checkInAt, checkOutAt, worked, status,
        `Corrected: ${row.reason}`, actorUserId, nowIso(), nowIso(),
      );
    }
  }

  run(
    'UPDATE attendance_corrections SET status = ?, comment = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?',
    decision, comment, actorUserId, nowIso(), nowIso(), id,
  );

  notifyEmployee(row.employee_id, {
    title: `Attendance correction ${decision}`,
    body: `${row.date}: ${decision === 'approved' ? 'your attendance was updated.' : comment || 'please speak to HR.'}`,
    type: decision === 'approved' ? 'success' : 'warning',
    link: '/app/attendance',
  });

  return listCorrections({ limit: 1 }).length ? mapCorrection(get(
    `SELECT c.*, (e.first_name || ' ' || e.last_name) AS employee_name
     FROM attendance_corrections c JOIN employees e ON e.id = c.employee_id WHERE c.id = ?`, id,
  )) : null;
}

/** Today's check-in widget for the employee dashboard. */
export function myToday(employeeId) {
  const settings = Setting.getOrDefault();
  const key = dateKey();
  const record = todayRecord(employeeId, key);
  const leave = get(
    `SELECT lt.name FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE lr.employee_id = ? AND lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ? LIMIT 1`,
    employeeId, key, key,
  );
  return {
    date: key,
    officeStart: settings.officeStart,
    graceMinutes: settings.graceMinutes,
    halfDayHours: settings.halfDayHours,
    onLeave: leave ? leave.name : null,
    record: mapAttendance(record),
    canCheckIn: !record || !record.check_in_at,
    canCheckOut: Boolean(record && record.check_in_at && !record.check_out_at),
    geofence: settings.office,
  };
}

export { workingDaysInRange, addDaysKey, HttpError };
