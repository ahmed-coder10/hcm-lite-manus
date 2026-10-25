import { all, get, run, nowIso } from '../db/index.js';
import { conflict, notFound, unprocessable } from '../utils/http.js';
import { eachDayKey, isWeekend, fromKey, dateKey, workingDaysInRange, monthKey, monthRange } from '../utils/date.js';
import { Setting } from './settings.service.js';
import { notifyEmployee } from './notify.service.js';
import { recordAudit } from '../middleware/audit.js';

export const mapLeave = (row) =>
  row && {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || null,
    employeeCode: row.employee_code || null,
    departmentName: row.department_name || null,
    leaveTypeId: row.leave_type_id,
    leaveTypeName: row.leave_type_name || null,
    leaveTypeColor: row.leave_type_color || null,
    startDate: row.start_date,
    endDate: row.end_date,
    days: row.days,
    reason: row.reason,
    status: row.status,
    appliedVia: row.applied_via,
    comment: row.comment,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };

const LEAVE_JOIN = `
  FROM leave_requests lr
  JOIN employees e ON e.id = lr.employee_id
  JOIN leave_types lt ON lt.id = lr.leave_type_id
  LEFT JOIN departments d ON d.id = e.department_id`;

const LEAVE_SELECT = `SELECT lr.*, (e.first_name || ' ' || e.last_name) AS employee_name,
  e.employee_code, d.name AS department_name, lt.name AS leave_type_name, lt.color AS leave_type_color ${LEAVE_JOIN}`;

export function listLeave({ employeeId = null, status = null, departmentId = null, year = null, limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (employeeId) { where.push('lr.employee_id = ?'); params.push(employeeId); }
  if (status && status !== 'all') { where.push('lr.status = ?'); params.push(status); }
  if (departmentId) { where.push('e.department_id = ?'); params.push(departmentId); }
  if (year) { where.push("substr(lr.start_date, 1, 4) = ?"); params.push(String(year)); }
  return all(
    `${LEAVE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY lr.created_at DESC LIMIT ?`,
    ...params, Math.min(300, Number(limit) || 100),
  ).map(mapLeave);
}

export function getLeave(id) {
  const row = get(`${LEAVE_SELECT} WHERE lr.id = ?`, id);
  if (!row) throw notFound('Leave request not found.');
  return mapLeave(row);
}

/**
 * Balances are derived from approved leave, so they can never drift out of sync
 * with the requests table. Pending days are shown separately.
 */
export function balancesFor(employeeId, year = new Date().getFullYear()) {
  const types = all('SELECT * FROM leave_types WHERE is_active = 1 ORDER BY name');
  return types.map((t) => {
    const approved = get(
      `SELECT coalesce(sum(days),0) AS s FROM leave_requests
       WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved' AND substr(start_date,1,4) = ?`,
      employeeId, t.id, String(year),
    ).s;
    const pending = get(
      `SELECT coalesce(sum(days),0) AS s FROM leave_requests
       WHERE employee_id = ? AND leave_type_id = ? AND status = 'pending' AND substr(start_date,1,4) = ?`,
      employeeId, t.id, String(year),
    ).s;
    return {
      leaveTypeId: t.id,
      name: t.name,
      code: t.code,
      color: t.color,
      isPaid: t.is_paid === 1,
      unlimited: t.unlimited === 1,
      allocated: t.unlimited === 1 ? null : t.annual_quota,
      used: approved,
      pending,
      remaining: t.unlimited === 1 ? null : Math.max(0, t.annual_quota - approved),
    };
  });
}

/** Working days in a range, skipping weekends and public holidays. */
export function workingDaysOf(startDate, endDate) {
  const settings = Setting.getOrDefault();
  const holidays = all('SELECT date FROM holidays WHERE date >= ? AND date <= ?', startDate, endDate).map((h) => h.date);
  return workingDaysInRange(startDate, endDate, settings.weekendDays, holidays);
}

/**
 * Applies the M5 rules: working days only, no overlap with an existing
 * pending/approved request, and never more days than the remaining balance.
 */
export function applyLeave({ employeeId, leaveTypeId, startDate, endDate, reason = '', appliedVia = 'web' }) {
  const type = get('SELECT * FROM leave_types WHERE id = ? AND is_active = 1', leaveTypeId);
  if (!type) throw unprocessable('Choose a leave type.', { leaveTypeId: 'Unknown leave type' });
  if (!startDate || !endDate) throw unprocessable('Pick a start and end date.');
  if (endDate < startDate) throw unprocessable('The end date cannot be before the start date.');
  if (type.requires_reason === 1 && (!reason || reason.trim().length < 5)) {
    throw unprocessable('Please give a short reason for the leave.', { reason: 'Required' });
  }

  const leaveDays = workingDaysOf(startDate, endDate);
  if (!leaveDays.length) {
    throw unprocessable('Those dates are all weekends or holidays — no working days to apply for.');
  }

  const overlap = get(
    `SELECT id, start_date, end_date FROM leave_requests
     WHERE employee_id = ? AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ? LIMIT 1`,
    employeeId, endDate, startDate,
  );
  if (overlap) {
    throw unprocessable(
      `You already have leave from ${overlap.start_date} to ${overlap.end_date}. Cancel or change that request first.`,
      { dates: 'Overlaps an existing request' },
    );
  }

  const year = Number(startDate.slice(0, 4));
  if (type.unlimited !== 1) {
    const used = get(
      `SELECT coalesce(sum(days),0) AS s FROM leave_requests
       WHERE employee_id = ? AND leave_type_id = ? AND status IN ('approved','pending') AND substr(start_date,1,4) = ?`,
      employeeId, leaveTypeId, String(year),
    ).s;
    const remaining = Number(type.annual_quota) - used;
    if (leaveDays.length > remaining) {
      throw unprocessable(
        `Only ${remaining} day(s) of ${type.name} left this year, but this request is ${leaveDays.length} day(s).`,
        { dates: 'Exceeds remaining balance' },
      );
    }
  }

  if (!get('SELECT id FROM employees WHERE id = ?', employeeId)) throw notFound('Employee not found.');

  const id = crypto.randomUUID();
  run(
    `INSERT INTO leave_requests (id, employee_id, leave_type_id, start_date, end_date, days, reason, applied_via,
       created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, employeeId, leaveTypeId, startDate, endDate, leaveDays.length, reason.trim(), appliedVia, nowIso(), nowIso(),
  );
  return getLeave(id);
}

export function cancelLeave({ id, employeeId, isStaff = false }) {
  const row = get('SELECT * FROM leave_requests WHERE id = ?', id);
  if (!row) throw notFound('Leave request not found.');
  if (!isStaff && row.employee_id !== employeeId) throw conflict('You can only cancel your own requests.');
  if (row.status === 'cancelled') throw conflict('That request is already cancelled.');
  if (row.status === 'approved' && !isStaff) {
    throw conflict('Approved leave can only be cancelled by HR.');
  }
  run("UPDATE leave_requests SET status = 'cancelled', updated_at = ? WHERE id = ?", nowIso(), id);
  return getLeave(id);
}

export function decideLeave({ id, decision, comment = '', actorUserId, req }) {
  const row = get('SELECT * FROM leave_requests WHERE id = ?', id);
  if (!row) throw notFound('Leave request not found.');
  if (row.status !== 'pending') throw conflict(`That request is already ${row.status}.`);
  if (!['approved', 'rejected'].includes(decision)) throw unprocessable('Decision must be approved or rejected.');

  run(
    'UPDATE leave_requests SET status = ?, comment = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?',
    decision, comment, actorUserId, nowIso(), nowIso(), id,
  );

  notifyEmployee(row.employee_id, {
    title: `Leave ${decision}`,
    body: `${row.start_date} → ${row.end_date} (${row.days} day${row.days === 1 ? '' : 's'}) was ${decision}.${comment ? ` Note: ${comment}` : ''}`,
    type: decision === 'approved' ? 'success' : 'warning',
    link: '/app/leave',
  });

  if (req) {
    recordAudit(req, {
      action: `leave.${decision}`,
      entity: 'leave_request',
      entityId: id,
      summary: `${decision} leave for ${row.start_date}..${row.end_date}`,
      before: { status: 'pending' },
      after: { status: decision, comment },
    });
  }
  return getLeave(id);
}

/** Leave by type and department for the dashboards (M7). */
export function leaveSummary({ startKey, endKey }) {
  const byType = all(
    `SELECT lt.id, lt.name, lt.color, coalesce(sum(lr.days),0) AS days, count(lr.id) AS requests
     FROM leave_types lt
     LEFT JOIN leave_requests lr ON lr.leave_type_id = lt.id AND lr.status = 'approved'
       AND lr.start_date <= ? AND lr.end_date >= ?
     WHERE lt.is_active = 1 GROUP BY lt.id ORDER BY days DESC`,
    endKey, startKey,
  );
  const byDepartment = all(
    `SELECT coalesce(d.name,'Unassigned') AS department, coalesce(sum(lr.days),0) AS days
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?
     GROUP BY d.name ORDER BY days DESC`,
    endKey, startKey,
  );
  const pending = get("SELECT count(*) AS c FROM leave_requests WHERE status = 'pending'").c;
  return {
    byType: byType.map((r) => ({ id: r.id, name: r.name, color: r.color, days: r.days, requests: r.requests })),
    byDepartment,
    pending,
  };
}

/** "Who is on leave today?" — used by dashboards and the AI tool. */
export function whoIsOnLeave(key = dateKey()) {
  return all(
    `SELECT (e.first_name || ' ' || e.last_name) AS name, e.employee_code, lt.name AS type, lt.is_paid,
            d.name AS department
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?`,
    key, key,
  ).map((r) => ({ ...r, isPaid: r.is_paid === 1 }));
}

export const leaveUtilization = ({ startKey, endKey }) => {
  const approved = get(
    `SELECT coalesce(sum(days),0) AS s FROM leave_requests WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`,
    endKey, startKey,
  ).s;
  const quota = get('SELECT coalesce(sum(annual_quota),0) AS s FROM leave_types WHERE is_active = 1 AND unlimited = 0').s;
  const headcount = get("SELECT count(*) AS c FROM employees WHERE status IN ('active','probation')").c || 1;
  const denominator = quota * headcount;
  return {
    approvedDays: approved,
    quotaDays: denominator,
    utilization: denominator ? Math.round((approved / denominator) * 1000) / 10 : 0,
  };
};

export { eachDayKey, isWeekend, fromKey, monthKey, monthRange };
