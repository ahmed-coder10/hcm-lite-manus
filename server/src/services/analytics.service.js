import { all, get } from '../db/index.js';
import { dateKey, monthKey, monthRange, workingDaysInRange, addDaysKey, eachDayKey, fromKey, timeKey } from '../utils/date.js';
import { Setting } from './settings.service.js';
import { attendanceSummary, dailyBoard, employeeAttendance, lateCount } from './attendance.service.js';
import { balancesFor, leaveSummary, leaveUtilization, whoIsOnLeave } from './leave.service.js';
import { round } from '../domain/rules.js';

const rangeOrDefault = (startKey, endKey) => {
  const mk = monthKey();
  const m = monthRange(mk);
  return { startKey: startKey || m.startKey, endKey: endKey || m.endKey };
};

function headcount(departmentId = null) {
  const clause = departmentId ? 'AND department_id = ?' : '';
  const params = departmentId ? [departmentId] : [];
  const active = get(`SELECT count(*) AS c FROM employees WHERE status IN ('active','probation') ${clause}`, ...params).c;
  const probations = get("SELECT count(*) AS c FROM employees WHERE status = 'probation' " + clause, ...params).c;
  return { active, probation: probations, total: active };
}

function exitsInPeriod(startKey, endKey) {
  return get(
    "SELECT count(*) AS c FROM employees WHERE exit_date IS NOT NULL AND substr(exit_date,1,10) BETWEEN ? AND ?",
    startKey, endKey,
  ).c;
}

function payrollCostForMonth(month) {
  const row = get('SELECT * FROM payroll_runs WHERE month = ?', month);
  if (!row) return { gross: 0, net: 0, tax: 0, finalized: false, employees: 0, month };
  return {
    month,
    gross: row.total_prorated_gross,
    net: row.total_net,
    tax: row.total_tax,
    employees: row.employee_count,
    finalized: row.status === 'finalized',
  };
}

/** Headcount by department + payroll cost by department for the current draft. */
function byDepartment(month) {
  const rows = all(
    `SELECT coalesce(d.name, 'Unassigned') AS name, count(e.id) AS headcount
     FROM employees e LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.status IN ('active','probation') GROUP BY d.name ORDER BY headcount DESC`,
  );
  const cost = all(
    `SELECT coalesce(pi.snapshot_department, 'Unassigned') AS name, coalesce(sum(pi.prorated_gross),0) AS gross,
            coalesce(sum(pi.net),0) AS net
     FROM payroll_items pi JOIN payroll_runs pr ON pr.id = pi.run_id
     WHERE pr.month = ? GROUP BY pi.snapshot_department`,
    month,
  );
  const costMap = new Map(cost.map((c) => [c.name, c]));
  return rows.map((r) => ({
    name: r.name,
    headcount: r.headcount,
    payrollGross: costMap.get(r.name)?.gross || 0,
    payrollNet: costMap.get(r.name)?.net || 0,
  }));
}

const attendanceTrend = (endKey, days = 14) => {
  const startKey = addDaysKey(endKey, -(days - 1));
  const rows = all(
    `SELECT date, status, count(*) AS c FROM attendance WHERE date BETWEEN ? AND ? GROUP BY date, status`,
    startKey, endKey,
  );
  const leaveRows = all(
    `SELECT start_date, end_date FROM leave_requests WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`,
    endKey, startKey,
  );
  const map = new Map();
  for (const key of eachDayKey(startKey, endKey)) map.set(key, { date: key, present: 0, late: 0, halfDay: 0, onLeave: 0 });
  for (const r of rows) {
    const entry = map.get(r.date);
    if (!entry) continue;
    if (r.status === 'present') entry.present += r.c;
    if (r.status === 'late') entry.late += r.c;
    if (r.status === 'half_day') entry.halfDay += r.c;
  }
  for (const l of leaveRows) {
    for (const key of eachDayKey(l.start_date, l.end_date)) {
      const entry = map.get(key);
      if (entry) entry.onLeave += 1;
    }
  }
  return [...map.values()];
};

const topLateComers = (startKey, endKey, limit = 5) =>
  all(
    `SELECT (e.first_name || ' ' || e.last_name) AS name, e.employee_code, count(a.id) AS lateCount,
            coalesce(d.name,'—') AS department
     FROM attendance a JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE a.status = 'late' AND a.date BETWEEN ? AND ?
     GROUP BY e.id ORDER BY lateCount DESC LIMIT ?`,
    startKey, endKey, limit,
  );

const genderSplit = () =>
  all("SELECT gender, count(*) AS c FROM employees WHERE status IN ('active','probation') GROUP BY gender")
    .map((r) => ({ gender: r.gender, count: r.c }));

const tenureBuckets = () => {
  const rows = all("SELECT join_date FROM employees WHERE status IN ('active','probation')");
  const buckets = { '< 1 year': 0, '1–2 years': 0, '2–4 years': 0, '4+ years': 0 };
  const now = Date.now();
  for (const r of rows) {
    const years = (now - new Date(r.join_date).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (years < 1) buckets['< 1 year'] += 1;
    else if (years < 2) buckets['1–2 years'] += 1;
    else if (years < 4) buckets['2–4 years'] += 1;
    else buckets['4+ years'] += 1;
  }
  return Object.entries(buckets).map(([label, count]) => ({ label, count }));
};

/** Deterministic 3–5 bullet insights; the AI rephrases these for the UI. */
export function buildInsights(k) {
  const out = [];
  if (k.headcount === 0) {
    return ['Add your first employee to unlock the dashboard numbers.'];
  }
  out.push(`${k.headcount} people are on the payroll, ${k.departments} department(s) in total.`);
  if (k.attendanceRate != null) {
    out.push(`Attendance is ${k.attendanceRate}% for ${k.range.startKey} → ${k.range.endKey}.`);
  }
  if (k.lateToday > 0) out.push(`${k.lateToday} person(s) came in late today.`);
  if (k.pendingLeave > 0) out.push(`${k.pendingLeave} leave request(s) are waiting for a decision.`);
  if (k.payroll?.finalized) out.push(`${k.payroll.month} payroll is finalized at PKR ${Math.round(k.payroll.net).toLocaleString('en-PK')} net.`);
  else if (k.payroll?.employees) out.push(`${k.payroll.month} payroll is a draft — finalize it before the month closes.`);
  if (k.absentToday > 0) out.push(`${k.absentToday} employee(s) are absent today without approved leave.`);
  return out.slice(0, 5);
}

export function hrDashboard({ startKey, endKey, departmentId = null } = {}) {
  const range = rangeOrDefault(startKey, endKey);
  const today = dailyBoard(dateKey(), { departmentId });
  const attendance = attendanceSummary({ ...range, departmentId });
  const hc = headcount(departmentId);
  const leave = leaveSummary(range);
  const utilization = leaveUtilization(range);
  const payroll = payrollCostForMonth(monthKey());
  const costs = byDepartment(monthKey());
  const missingCheckout = get(
    "SELECT count(*) AS c FROM attendance WHERE check_out_at IS NULL AND date BETWEEN ? AND ?",
    range.startKey, range.endKey,
  ).c;
  const pendingApprovals =
    get("SELECT count(*) AS c FROM leave_requests WHERE status = 'pending'").c +
    get("SELECT count(*) AS c FROM attendance_corrections WHERE status = 'pending'").c;

  const kpis = {
    headcount: hc.total,
    departments: get('SELECT count(*) AS c FROM departments WHERE is_active = 1').c,
    presentToday: today.summary.present,
    lateToday: today.summary.late,
    absentToday: today.summary.absent,
    onLeaveToday: today.summary.onLeave,
    pendingLeave: leave.pending,
    pendingApprovals,
    missingCheckout,
    attendanceRate: attendance.attendanceRate,
    lateTotal: attendance.late,
    absentTotal: attendance.absent,
    leaveUtilization: utilization.utilization,
    payroll,
    range,
  };

  return {
    role: 'hr',
    generatedAt: new Date().toISOString(),
    kpis,
    today: { date: today.date, weekend: today.isWeekend, holiday: today.holiday, summary: today.summary },
    trend: attendanceTrend(range.endKey, 14),
    departmentAttendance: costs.map((c) => {
      const deptRow = get('SELECT id FROM departments WHERE name = ?', c.name);
      if (!deptRow) return { name: c.name, attendanceRate: null, headcount: c.headcount };
      const summary = attendanceSummary({ ...range, departmentId: deptRow.id });
      return { name: c.name, headcount: c.headcount, attendanceRate: summary.attendanceRate, absent: summary.absent };
    }),
    leave: { ...leave, utilization: utilization.utilization },
    lateComers: topLateComers(range.startKey, range.endKey),
    onLeaveToday: whoIsOnLeave(dateKey()),
    recentHires: all(
      "SELECT (first_name || ' ' || last_name) AS name, employee_code, join_date FROM employees WHERE status IN ('active','probation') ORDER BY join_date DESC LIMIT 5",
    ),
    insights: buildInsights(kpis),
  };
}

export function adminDashboard({ startKey, endKey } = {}) {
  const range = rangeOrDefault(startKey, endKey);
  const mk = monthKey();
  const hc = headcount();
  const monthRangeNow = monthRange(mk);
  const exits = get(
    "SELECT count(*) AS c FROM employees WHERE exit_date IS NOT NULL AND substr(exit_date,1,10) BETWEEN ? AND ?",
    `${mk}-01`, range.endKey,
  ).c;
  const attrition = hc.total ? round((exits / hc.total) * 100) : 0;
  const payroll = payrollCostForMonth(mk);
  const avgSalary = get(
    "SELECT coalesce(avg(basic + basic*house_rent_pct/100.0 + basic*medical_pct/100.0 + other_allowances),0) AS s FROM employees WHERE status IN ('active','probation')",
  ).s;
  const audit = all(
    `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8`,
  ).map((a) => ({ id: a.id, actorName: a.actor_name, action: a.action, entity: a.entity, summary: a.summary, createdAt: a.created_at }));
  const attendance = attendanceSummary(range);

  const kpis = {
    headcount: hc.total,
    probations: hc.probation,
    departments: get('SELECT count(*) AS c FROM departments WHERE is_active = 1').c,
    attrition,
    exits,
    payroll,
    avgSalary: round(avgSalary),
    attendanceRate: attendance.attendanceRate,
    range,
  };

  return {
    role: 'admin',
    generatedAt: new Date().toISOString(),
    kpis,
    headcountByDepartment: byDepartment(mk),
    payrollByMonth: all(
      "SELECT month, total_prorated_gross AS gross, total_net AS net, status FROM payroll_runs ORDER BY month DESC LIMIT 6",
    ),
    genderSplit: genderSplit(),
    tenure: tenureBuckets(),
    auditFeed: audit,
    trend: attendanceTrend(range.endKey, 14),
    insights: buildInsights({ ...kpis, pendingLeave: get("SELECT count(*) AS c FROM leave_requests WHERE status='pending'").c, lateToday: 0, absentToday: 0 }),
  };
}

export function employeeDashboard(employeeId) {
  const employee = get('SELECT * FROM employees WHERE id = ?', employeeId);
  if (!employee) return null;
  const settings = Setting.getOrDefault();
  const today = dateKey();
  const weekStart = addDaysKey(today, -(new Date(today).getUTCDay() === 0 ? 6 : new Date(today).getUTCDay() - 1));
  const month = monthKey();
  const { startKey, endKey } = monthRange(month);
  const { counts } = employeeAttendance(employeeId, startKey, endKey, { settings, employee });
  const weekMinutes = get(
    'SELECT coalesce(sum(worked_minutes),0) AS s FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?',
    employeeId, weekStart, today,
  ).s;
  const record = get('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', employeeId, today);
  const lastPayslip = get(
    `SELECT pi.net, pr.month FROM payroll_items pi JOIN payroll_runs pr ON pr.id = pi.run_id
     WHERE pi.employee_id = ? AND pr.status = 'finalized' ORDER BY pr.month DESC LIMIT 1`,
    employeeId,
  );
  const pending = get(
    "SELECT count(*) AS c FROM leave_requests WHERE employee_id = ? AND status = 'pending'",
    employeeId,
  ).c;

  return {
    role: 'employee',
    generatedAt: new Date().toISOString(),
    kpis: {
      hoursThisWeek: round(weekMinutes / 60),
      targetHours: 40,
      lateThisMonth: counts.late,
      absentThisMonth: counts.absent,
      leaveTakenThisMonth: counts.onLeave,
      pendingLeave: pending,
      lastPayslipNet: lastPayslip ? lastPayslip.net : null,
      lastPayslipMonth: lastPayslip ? lastPayslip.month : null,
      workingDays: counts.workingDays,
    },
    today: {
      date: today,
      checkInAt: record ? record.check_in_at : null,
      checkOutAt: record ? record.check_out_at : null,
      checkInTime: record ? timeKey(record.check_in_at) : null,
      checkOutTime: record ? timeKey(record.check_out_at) : null,
      workedMinutes: record ? record.worked_minutes : 0,
      status: record ? record.status : 'not_checked_in',
      canCheckIn: !record || !record.check_in_at,
      canCheckOut: Boolean(record && record.check_in_at && !record.check_out_at),
    },
    leaveBalances: balancesFor(employeeId),
    week: { start: weekStart, minutes: weekMinutes, days: all(
      'SELECT date, worked_minutes, status FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? ORDER BY date',
      employeeId, weekStart, today,
    ) },
    calendar: employeeAttendance(employeeId, startKey, endKey, { settings, employee }).days.slice(-14),
    announcements: all('SELECT * FROM announcements ORDER BY pinned DESC, published_at DESC LIMIT 3').map((a) => ({
      id: a.id, title: a.title, body: a.body, publishedAt: a.published_at, pinned: a.pinned === 1,
    })),
    insights: [
      counts.late > 0 ? `You were late ${counts.late} time(s) this month.` : 'No late arrivals this month — keep it up.',
      pending ? `${pending} leave request(s) are waiting for HR.` : 'You have no pending leave requests.',
      lastPayslip ? `Last payslip (${lastPayslip.month}): PKR ${Math.round(lastPayslip.net).toLocaleString('en-PK')} net.` : 'No finalized payslip yet.',
    ],
  };
}

export function dashboardFor(role, employeeId, params) {
  if (role === 'admin') return adminDashboard(params);
  if (role === 'hr') return hrDashboard(params);
  return employeeDashboard(employeeId);
}

/** Compact KPI JSON handed to the LLM for "Summarize". */
export function kpiSnapshot({ role, employeeId }) {
  const data = dashboardFor(role, employeeId, {});
  return {
    role,
    range: data.kpis.range || null,
    kpis: data.kpis,
    trend: data.trend || null,
    topLateComers: data.lateComers || null,
    leave: data.leave
      ? { byType: data.leave.byType, byDepartment: data.leave.byDepartment, pending: data.leave.pending, utilization: data.leave.utilization }
      : null,
  };
}

export { workingDaysInRange, fromKey };
