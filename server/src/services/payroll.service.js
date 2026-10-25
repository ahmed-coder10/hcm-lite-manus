import PDFDocument from 'pdfkit';
import { all, get, run, nowIso, tx, parseJson } from '../db/index.js';
import { conflict, notFound, unprocessable } from '../utils/http.js';
import { monthRange, workingDaysInRange, dateKey, fromKey, eachDayKey, addDaysKey } from '../utils/date.js';
import { computeGross, computeTax, prorateGross, deductionDays, round } from '../domain/rules.js';
import { Setting } from './settings.service.js';
import { employeeAttendance } from './attendance.service.js';
import { notifyEmployee } from './notify.service.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertMonth(month) {
  if (!MONTH_RE.test(String(month || ''))) throw unprocessable('Pick a month in YYYY-MM format.');
  return month;
}

export const mapRun = (row) =>
  row && {
    id: row.id,
    month: row.month,
    status: row.status,
    workingDays: row.working_days,
    employeeCount: row.employee_count,
    totals: {
      gross: row.total_gross,
      proratedGross: row.total_prorated_gross,
      deductions: row.total_deductions,
      tax: row.total_tax,
      net: row.total_net,
    },
    preparedBy: row.prepared_by,
    finalizedBy: row.finalized_by,
    finalizedAt: row.finalized_at,
    notes: row.notes,
    createdAt: row.created_at,
  };

export const mapItem = (row) =>
  row && {
    id: row.id,
    runId: row.run_id,
    employeeId: row.employee_id,
    employeeName: row.snapshot_name,
    employeeCode: row.snapshot_code,
    department: row.snapshot_department,
    designation: row.snapshot_designation,
    month: row.month || null,
    basic: row.basic,
    hra: row.hra,
    medical: row.medical,
    otherAllowances: row.other_allowances,
    gross: row.gross,
    eligibleDays: row.eligible_days,
    workingDays: row.working_days,
    presentDays: row.present_days,
    lateDays: row.late_days,
    absentDays: row.absent_days,
    halfDays: row.half_days,
    paidLeaveDays: row.paid_leave_days,
    unpaidLeaveDays: row.unpaid_leave_days,
    perDay: row.per_day,
    proratedGross: row.prorated_gross,
    absenceDeduction: row.absence_deduction,
    unpaidDeduction: row.unpaid_deduction,
    halfDayDeduction: row.half_day_deduction,
    latePenaltyDays: row.late_penalty_days,
    latePenaltyDeduction: row.late_penalty_deduction,
    totalDeductions: row.total_deductions,
    taxableIncome: row.taxable_income,
    tax: row.tax,
    net: row.net,
    breakdown: parseJson(row.breakdown, []),
  };

/** Working days in the month, minus weekends and public holidays. */
export function monthWorkingDays(month) {
  const settings = Setting.getOrDefault();
  const { startKey, endKey } = monthRange(month);
  const holidays = all('SELECT date FROM holidays WHERE date >= ? AND date <= ?', startKey, endKey).map((h) => h.date);
  return {
    startKey,
    endKey,
    holidayKeys: holidays,
    days: workingDaysInRange(startKey, endKey, settings.weekendDays, holidays),
  };
}

/**
 * The payroll engine. Pure calculation over the same attendance service the
 * dashboards use, so a payslip always matches what HR sees on screen.
 */
export function computePayroll(month, { departmentId = null } = {}) {
  assertMonth(month);
  const settings = Setting.getOrDefault();
  const { startKey, endKey, holidayKeys, days: workingDaysList } = monthWorkingDays(month);
  const workingDays = workingDaysList.length;
  if (!workingDays) throw unprocessable('That month has no working days.');

  const employees = all(
    `SELECT * FROM employees
     WHERE join_date <= ? AND (exit_date IS NULL OR exit_date >= ?)
     ${departmentId ? 'AND department_id = ?' : ''}
     ORDER BY first_name`,
    `${endKey}T23:59:59`, `${startKey}T00:00:00`, ...(departmentId ? [departmentId] : []),
  );

  const unpaidTypeIds = new Set(all('SELECT id FROM leave_types WHERE is_paid = 0').map((r) => r.id));
  const holidaySet = new Set(holidayKeys);

  const items = employees.map((employee) => {
    const joinKey = employee.join_date.slice(0, 10);
    const exitKey = employee.exit_date ? employee.exit_date.slice(0, 10) : null;
    const eligibleDays = workingDaysList.filter(
      (key) => key >= joinKey && (!exitKey || key <= exitKey),
    ).length;
    if (!eligibleDays) return null;

    const { counts, days } = employeeAttendance(employee.id, startKey, endKey, {
      settings, holidays: holidaySet, employee,
    });

    const unpaidLeaveDays = all(
      `SELECT lr.start_date, lr.end_date FROM leave_requests lr
       WHERE lr.employee_id = ? AND lr.status = 'approved' AND lr.leave_type_id IN (${[...unpaidTypeIds].map(() => '?').join(',') || "''"})
         AND lr.start_date <= ? AND lr.end_date >= ?`,
      employee.id, ...(unpaidTypeIds.size ? [...unpaidTypeIds] : []), endKey, startKey,
    ).reduce((sum, row) => {
      const keys = eachDayKey(row.start_date, row.end_date).filter(
        (k) => k >= startKey && k <= endKey && k >= joinKey && (!exitKey || k <= exitKey),
      );
      const settingsNow = settings;
      return sum + keys.filter((k) => {
        const dow = fromKey(k).getUTCDay();
        return !settingsNow.weekendDays.includes(dow) && !holidaySet.has(k);
      }).length;
    }, 0);

    const paidLeaveDays = Math.max(0, counts.onLeave - unpaidLeaveDays);

    const { basic, hra, medical, otherAllowances, gross } = computeGross({
      basic: employee.basic,
      houseRentPct: employee.house_rent_pct,
      medicalPct: employee.medical_pct,
      otherAllowances: employee.other_allowances,
    });

    const perDay = round(gross / workingDays);
    const prorated = prorateGross(gross, eligibleDays, workingDays);
    const deduction = deductionDays({
      absentDays: counts.absent,
      unpaidLeaveDays,
      halfDays: counts.halfDay,
      lateDays: counts.late,
      threeLatesEqualsHalfDay: settings.latePenalty,
    });

    const absenceDeduction = round(deduction.absentDays * perDay);
    const unpaidDeduction = round(deduction.unpaidLeaveDays * perDay);
    const halfDayDeduction = round(deduction.halfDays * perDay);
    const latePenaltyDeduction = round(deduction.latePenaltyDays * perDay);
    const totalDeductions = round(absenceDeduction + unpaidDeduction + halfDayDeduction + latePenaltyDeduction);

    const taxableIncome = prorated;
    const tax = computeTax(taxableIncome, settings.taxSlabs);
    const net = round(Math.max(0, prorated - totalDeductions - tax));

    const departmentName = employee.department_id
      ? get('SELECT name FROM departments WHERE id = ?', employee.department_id)?.name || ''
      : '';
    const designationTitle = employee.designation_id
      ? get('SELECT title FROM designations WHERE id = ?', employee.designation_id)?.title || ''
      : '';

    return {
      employeeId: employee.id,
      snapshot: {
        name: `${employee.first_name} ${employee.last_name}`,
        code: employee.employee_code,
        department: departmentName,
        designation: designationTitle,
        joinDate: employee.join_date,
        bankName: employee.bank_name,
        accountNumber: employee.account_number,
      },
      basic, hra, medical, otherAllowances, gross,
      eligibleDays, workingDays,
      presentDays: counts.present,
      lateDays: counts.late,
      absentDays: counts.absent,
      halfDays: counts.halfDay,
      paidLeaveDays,
      unpaidLeaveDays,
      perDay, proratedGross: prorated,
      absenceDeduction, unpaidDeduction, halfDayDeduction,
      latePenaltyDays: deduction.latePenaltyDays,
      latePenaltyDeduction,
      totalDeductions, taxableIncome, tax, net,
      missingCheckoutDays: counts.missingCheckout,
      breakdown: [
        { label: 'Basic salary', type: 'earning', amount: basic },
        { label: `House rent (${employee.house_rent_pct}%)`, type: 'earning', amount: hra },
        { label: `Medical (${employee.medical_pct}%)`, type: 'earning', amount: medical },
        ...(otherAllowances ? [{ label: 'Other allowances', type: 'earning', amount: otherAllowances }] : []),
        { label: `Prorated for ${eligibleDays}/${workingDays} working days`, type: 'note', amount: prorated - gross },
        ...(absenceDeduction ? [{ label: `Absent ${counts.absent} day(s)`, type: 'deduction', amount: absenceDeduction }] : []),
        ...(unpaidDeduction ? [{ label: `Unpaid leave ${unpaidLeaveDays} day(s)`, type: 'deduction', amount: unpaidDeduction }] : []),
        ...(halfDayDeduction ? [{ label: `Half days (${counts.halfDay})`, type: 'deduction', amount: halfDayDeduction }] : []),
        ...(latePenaltyDeduction ? [{ label: `Late penalty (${deduction.latePenaltyDays} day(s))`, type: 'deduction', amount: latePenaltyDeduction }] : []),
        ...(tax ? [{ label: 'Income tax', type: 'deduction', amount: tax }] : []),
      ],
    };
  }).filter(Boolean);

  const totals = items.reduce(
    (acc, it) => ({
      gross: round(acc.gross + it.gross),
      proratedGross: round(acc.proratedGross + it.proratedGross),
      deductions: round(acc.deductions + it.totalDeductions),
      tax: round(acc.tax + it.tax),
      net: round(acc.net + it.net),
    }),
    { gross: 0, proratedGross: 0, deductions: 0, tax: 0, net: 0 },
  );

  return { month, workingDays, startKey, endKey, items, totals };
}

export function listRuns() {
  return all('SELECT * FROM payroll_runs ORDER BY month DESC').map(mapRun);
}

export function getRun(id) {
  const run = get(
    `SELECT pr.*, (SELECT count(*) FROM payroll_items WHERE run_id = pr.id) AS item_count FROM payroll_runs pr WHERE pr.id = ?`,
    id,
  );
  if (!run) throw notFound('Payroll run not found.');
  const items = all(
    'SELECT * FROM payroll_items WHERE run_id = ? ORDER BY snapshot_name', id,
  ).map((row) => mapItem(row));
  return { ...mapRun(run), items };
}

export function getRunByMonth(month) {
  const run = get('SELECT * FROM payroll_runs WHERE month = ?', month);
  return run ? getRun(run.id) : null;
}

/** Creates (or refreshes, while still a draft) the monthly payroll run. */
export function createDraft(month, actorUserId, { departmentId = null } = {}) {
  assertMonth(month);
  const existing = get('SELECT * FROM payroll_runs WHERE month = ?', month);
  if (existing && existing.status === 'finalized') {
    throw conflict(`${month} payroll is finalized and locked. Ask an Admin to unlock it.`);
  }

  const computed = computePayroll(month);
  const runId = existing ? existing.id : crypto.randomUUID();
  const now = nowIso();

  tx(() => {
    if (existing) {
      run(
        `UPDATE payroll_runs SET working_days=?, employee_count=?, total_gross=?, total_prorated_gross=?,
           total_deductions=?, total_tax=?, total_net=?, prepared_by=?, updated_at=? WHERE id=?`,
        computed.workingDays, computed.items.length, computed.totals.gross, computed.totals.proratedGross,
        computed.totals.deductions, computed.totals.tax, computed.totals.net, actorUserId, now, runId,
      );
      run('DELETE FROM payroll_items WHERE run_id = ?', runId);
    } else {
      run(
        `INSERT INTO payroll_runs (id, month, status, working_days, employee_count, total_gross,
           total_prorated_gross, total_deductions, total_tax, total_net, prepared_by, created_at, updated_at)
         VALUES (?,?,'draft',?,?,?,?,?,?,?,?,?,?)`,
        runId, month, computed.workingDays, computed.items.length, computed.totals.gross,
        computed.totals.proratedGross, computed.totals.deductions, computed.totals.tax,
        computed.totals.net, actorUserId, now, now,
      );
    }

    for (const item of computed.items) {
      run(
        `INSERT INTO payroll_items (id, run_id, employee_id, snapshot_name, snapshot_code, snapshot_department,
           snapshot_designation, snapshot_join_date, snapshot_bank, snapshot_account, basic, hra, medical,
           other_allowances, gross, eligible_days, working_days, present_days, late_days, absent_days, half_days,
           paid_leave_days, unpaid_leave_days, per_day, prorated_gross, absence_deduction, unpaid_deduction,
           half_day_deduction, late_penalty_days, late_penalty_deduction, total_deductions, taxable_income, tax,
           net, breakdown, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        crypto.randomUUID(), runId, item.employeeId, item.snapshot.name, item.snapshot.code,
        item.snapshot.department, item.snapshot.designation, item.snapshot.joinDate, item.snapshot.bankName,
        item.snapshot.accountNumber, item.basic, item.hra, item.medical, item.otherAllowances, item.gross,
        item.eligibleDays, item.workingDays, item.presentDays, item.lateDays, item.absentDays, item.halfDays,
        item.paidLeaveDays, item.unpaidLeaveDays, item.perDay, item.proratedGross, item.absenceDeduction,
        item.unpaidDeduction, item.halfDayDeduction, item.latePenaltyDays, item.latePenaltyDeduction,
        item.totalDeductions, item.taxableIncome, item.tax, item.net, JSON.stringify(item.breakdown), now,
      );
    }
  });

  return getRun(runId);
}

/** Only an Admin can finalize — and a finalized run is locked (brief, M6). */
export function finalizeRun(id, actorUserId) {
  const runRow = get('SELECT * FROM payroll_runs WHERE id = ?', id);
  if (!runRow) throw notFound('Payroll run not found.');
  if (runRow.status === 'finalized') throw conflict('This payroll run is already finalized.');
  if (!runRow.employee_count) throw unprocessable('There is nothing to finalize — generate the payroll first.');

  run(
    "UPDATE payroll_runs SET status = 'finalized', finalized_by = ?, finalized_at = ?, updated_at = ? WHERE id = ?",
    actorUserId, nowIso(), nowIso(), id,
  );

  for (const item of all('SELECT * FROM payroll_items WHERE run_id = ?', id)) {
    notifyEmployee(item.employee_id, {
      title: `Payslip ready for ${runRow.month}`,
      body: `Your payslip for ${runRow.month} is available. Net pay PKR ${Math.round(item.net).toLocaleString('en-PK')}.`,
      type: 'success',
      link: `/app/payroll?month=${runRow.month}`,
    });
  }
  return getRun(id);
}

export function payslipFor({ itemId, employeeId = null }) {
  const row = get(
    `SELECT pi.*, pr.month, pr.status AS run_status FROM payroll_items pi
     JOIN payroll_runs pr ON pr.id = pi.run_id WHERE pi.id = ?`,
    itemId,
  );
  if (!row) throw notFound('Payslip not found.');
  if (row.run_status !== 'finalized') throw unprocessable('Payslips are available once an Admin finalizes the month.');
  if (employeeId && row.employee_id !== employeeId) throw notFound('Payslip not found.');
  return { ...mapItem(row), runStatus: row.run_status };
}

/** HR: the latest finalized payslip for one employee in a month. */
export function payslipForMonth(month, employeeId) {
  const row = get(
    `SELECT pi.*, pr.month, pr.status AS run_status FROM payroll_items pi
     JOIN payroll_runs pr ON pr.id = pi.run_id
     WHERE pr.month = ? AND pi.employee_id = ?`,
    month, employeeId,
  );
  return row ? { ...mapItem(row), runStatus: row.run_status } : null;
}

export const myPayslips = (employeeId) =>
  all(
    `SELECT pi.id, pi.net, pi.gross, pi.created_at, pr.month, pr.status FROM payroll_items pi
     JOIN payroll_runs pr ON pr.id = pi.run_id WHERE pi.employee_id = ?
     ORDER BY pr.month DESC`,
    employeeId,
  ).map((r) => ({ id: r.id, month: r.month, net: r.net, gross: r.gross, runStatus: r.status }));

/* --------------------------------- PDF ------------------------------------ */

const money = (n) => `PKR ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;

/** Streams a one-page payslip PDF. */
export function streamPayslip(res, payslip, company) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="payslip-${payslip.employeeCode || 'employee'}-${payslip.month}.pdf"`,
  );
  doc.pipe(res);

  doc.fillColor('#0B0F1A').fontSize(22).font('Helvetica-Bold').text(company.companyName || 'HCM Lite', 50, 50);
  doc.fontSize(9).fillColor('#6B7280').font('Helvetica').text('AI-assisted Human Capital Management', 50, 78);
  doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#E5E7EB').stroke();

  doc.fillColor('#0B0F1A').fontSize(16).font('Helvetica-Bold').text('Payslip', 50, 118);
  doc.fontSize(11).font('Helvetica').fillColor('#374151').text(`For ${payslip.month}`, 50, 140);

  doc.fontSize(10).fillColor('#111827');
  doc.font('Helvetica-Bold').text(payslip.employeeName, 320, 118);
  doc.font('Helvetica').text(`${payslip.employeeCode}  ·  ${payslip.department || '—'}`, 320, 134);
  doc.text(payslip.designation || '', 320, 148);
  doc.text(`Paid days: ${payslip.eligibleDays}/${payslip.workingDays}`, 320, 162);

  const rows = [
    ['Basic salary', money(payslip.basic)],
    [`House rent (${Math.round((payslip.hra / (payslip.basic || 1)) * 100)}%)`, money(payslip.hra)],
    [`Medical (${Math.round((payslip.medical / (payslip.basic || 1)) * 100)}%)`, money(payslip.medical)],
    ...(payslip.otherAllowances ? [['Other allowances', money(payslip.otherAllowances)]] : []),
    ['Gross salary', money(payslip.gross)],
  ];
  let y = 200;
  doc.font('Helvetica-Bold').fillColor('#111827').text('Earnings', 50, y);
  doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text('', 50, y);
  y += 18;
  for (const [label, value] of rows) {
    doc.fontSize(10).fillColor('#374151').font('Helvetica').text(label, 50, y);
    doc.fillColor('#111827').text(value, 400, y, { width: 145, align: 'right' });
    y += 18;
  }

  y += 10;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Deductions', 50, y);
  y += 18;
  const deductions = [
    ['Absent days', money(payslip.absenceDeduction)],
    ['Unpaid leave', money(payslip.unpaidDeduction)],
    ['Half days', money(payslip.halfDayDeduction)],
    ['Late penalty', money(payslip.latePenaltyDeduction)],
    ['Income tax', money(payslip.tax)],
  ];
  for (const [label, value] of deductions) {
    doc.fontSize(10).font('Helvetica').fillColor('#374151').text(label, 50, y);
    doc.fillColor('#111827').text(value, 400, y, { width: 145, align: 'right' });
    y += 18;
  }

  y += 12;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#E5E7EB').stroke();
  y += 14;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text('Net pay', 50, y);
  doc.text(money(payslip.net), 380, y, { width: 165, align: 'right' });

  y += 36;
  doc.fontSize(8).fillColor('#6B7280').font('Helvetica')
    .text('Computer-generated payslip from HCM Lite. Tax is illustrative (Section 3, Hackathon brief).', 50, y, { width: 495 });
  doc.end();
}

export { dateKey, addDaysKey };
