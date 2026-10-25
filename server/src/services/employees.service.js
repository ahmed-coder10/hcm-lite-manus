import { all, get, run, nowIso, paginate, tx } from '../db/index.js';
import { hashPassword } from './auth.service.js';
import { conflict, notFound, unprocessable } from '../utils/http.js';
import { computeGross } from '../domain/rules.js';
import { dateKey, monthKey, monthRange, workingDaysInRange, daysBetween, eachDayKey } from '../utils/date.js';
import { Setting } from './settings.service.js';
import { parseCsv, toCsv } from '../utils/csv.js';

const EMPLOYEE_SELECT = `
  SELECT e.*, d.name AS department_name, dg.title AS designation_title,
         (m.first_name || ' ' || m.last_name) AS manager_name
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN designations dg ON dg.id = e.designation_id
  LEFT JOIN employees m ON m.id = e.manager_id`;

export function mapEmployee(row, { withSalary = true } = {}) {
  if (!row) return null;
  const gross = computeGross({
    basic: row.basic,
    houseRentPct: row.house_rent_pct,
    medicalPct: row.medical_pct,
    otherAllowances: row.other_allowances,
  });
  return {
    id: row.id,
    employeeCode: row.employee_code,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    cnic: row.cnic,
    joinDate: row.join_date,
    exitDate: row.exit_date,
    status: row.status,
    employmentType: row.employment_type,
    departmentId: row.department_id,
    departmentName: row.department_name || null,
    designationId: row.designation_id,
    designationTitle: row.designation_title || null,
    managerId: row.manager_id,
    managerName: row.manager_name || null,
    seniority: row.employment_type,
    salary: withSalary
      ? {
          basic: row.basic,
          houseRentPct: row.house_rent_pct,
          medicalPct: row.medical_pct,
          hra: gross.hra,
          medical: gross.medical,
          otherAllowances: row.other_allowances,
          gross: gross.gross,
          bankName: row.bank_name,
          accountTitle: row.account_title,
          accountNumber: row.account_number,
        }
      : undefined,
    emergencyContact: {
      name: row.emergency_name,
      phone: row.emergency_phone,
      relation: row.emergency_relation,
    },
    notes: row.notes,
    photoUrl: row.photo_url,
    createdAt: row.created_at,
  };
}

export function listEmployees(filters = {}) {
  const { q, departmentId, status, employmentType, page, limit, sort = 'name' } = filters;
  const where = [];
  const params = [];
  if (q) {
    where.push('(e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.employee_code LIKE ? OR (e.first_name || \' \' || e.last_name) LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (departmentId) {
    where.push('e.department_id = ?');
    params.push(departmentId);
  }
  if (status === 'all') {
    /* no filter */
  } else if (status) {
    where.push('e.status = ?');
    params.push(status);
  } else {
    where.push("e.status IN ('active','probation')");
  }
  if (employmentType) {
    where.push('e.employment_type = ?');
    params.push(employmentType);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { page: p, limit: l, offset } = paginate({ page, limit });
  const order = sort === 'newest' ? 'e.created_at DESC' : sort === 'code' ? 'e.employee_code ASC' : 'e.first_name ASC, e.last_name ASC';

  const total = get(`SELECT count(*) AS c FROM employees e ${clause}`, ...params).c;
  const rows = all(`${EMPLOYEE_SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, l, offset);
  return { items: rows.map((r) => mapEmployee(r)), page: p, limit: l, total, pages: Math.ceil(total / l) || 1 };
}

export function getEmployeeById(id) {
  const row = get(`${EMPLOYEE_SELECT} WHERE e.id = ?`, id);
  if (!row) throw notFound('Employee not found.');
  return mapEmployee(row);
}

export function findEmployeeRow(id) {
  return get('SELECT * FROM employees WHERE id = ?', id);
}

const assertRefs = ({ departmentId, designationId, managerId }, selfId = null) => {
  if (departmentId && !get('SELECT id FROM departments WHERE id = ?', departmentId)) {
    throw unprocessable('Pick a department from the list.', { departmentId: 'Unknown department' });
  }
  if (designationId && !get('SELECT id FROM designations WHERE id = ?', designationId)) {
    throw unprocessable('Pick a designation from the list.', { designationId: 'Unknown designation' });
  }
  if (managerId) {
    if (managerId === selfId) throw unprocessable('An employee cannot be their own manager.');
    if (!get('SELECT id FROM employees WHERE id = ?', managerId)) {
      throw unprocessable('Pick a manager from the list.', { managerId: 'Unknown manager' });
    }
  }
};

export function generateTempPassword() {
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  return `Hcm@${digits}`;
}

/**
 * HR registers an employee -> this creates their login with a temporary
 * password that must be changed on first sign-in (brief, M3).
 */
export async function createEmployee(payload, actor) {
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) throw unprocessable('Email is required.', { email: 'Required' });
  if (get('SELECT id FROM employees WHERE lower(email) = ?', email)) {
    throw conflict('An employee with that email already exists.', { email: 'Already used' });
  }
  if (get('SELECT id FROM users WHERE lower(email) = ?', email)) {
    throw conflict('That email already has a login.', { email: 'Already used' });
  }
  assertRefs(payload);
  if (!(Number(payload.basic) > 0)) {
    throw unprocessable('Basic salary must be greater than 0.', { basic: 'Must be greater than 0' });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const employeeCode = (payload.employeeCode || (await nextCode())).toUpperCase();
  const now = nowIso();
  const employeeId = crypto.randomUUID();

  tx(() => {
    run(
      `INSERT INTO employees (id, employee_code, first_name, last_name, email, phone, address, city, gender,
        date_of_birth, cnic, join_date, exit_date, status, employment_type, department_id, designation_id,
        manager_id, basic, house_rent_pct, medical_pct, other_allowances, bank_name, account_title, account_number,
        emergency_name, emergency_phone, emergency_relation, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      employeeId, employeeCode, payload.firstName.trim(), payload.lastName.trim(), email,
      payload.phone || '', payload.address || '', payload.city || '', payload.gender || 'undisclosed',
      payload.dateOfBirth || null, payload.cnic || '', payload.joinDate, payload.exitDate || null,
      payload.status || 'active', payload.employmentType || 'full_time',
      payload.departmentId || null, payload.designationId || null, payload.managerId || null,
      Number(payload.basic), payload.houseRentPct ?? 40, payload.medicalPct ?? 10,
      Number(payload.otherAllowances || 0), payload.bankName || '', payload.accountTitle || '',
      payload.accountNumber || '', payload.emergencyName || '', payload.emergencyPhone || '',
      payload.emergencyRelation || '', payload.notes || '', now, now,
    );
    run(
      `INSERT INTO users (id, name, email, password_hash, role, employee_id, is_active, must_change_password,
         temp_password_issued_at, created_at, updated_at)
       VALUES (?,?,?,?,'employee',?,1,1,?,?,?)`,
      crypto.randomUUID(), `${payload.firstName.trim()} ${payload.lastName.trim()}`, email,
      passwordHash, employeeId, now, now, now,
    );
  });

  return { employee: getEmployeeById(employeeId), tempPassword };
}

async function nextCode() {
  const last = get(
    "SELECT employee_code FROM employees WHERE employee_code LIKE 'EMP-%' ORDER BY employee_code DESC LIMIT 1",
  );
  const n = last ? Number(last.employee_code.split('-')[1]) + 1 : 1;
  return `EMP-${String(n).padStart(4, '0')}`;
}

export function updateEmployee(id, patch) {
  const row = findEmployeeRow(id);
  if (!row) throw notFound('Employee not found.');
  assertRefs(
    {
      departmentId: patch.departmentId,
      designationId: patch.designationId,
      managerId: patch.managerId,
    },
    id,
  );
  if (patch.email) {
    const email = String(patch.email).trim().toLowerCase();
    const clash = get('SELECT id FROM employees WHERE lower(email) = ? AND id <> ?', email, id);
    if (clash) throw conflict('Another employee already uses that email.', { email: 'Already used' });
    run('UPDATE users SET email = ?, updated_at = ? WHERE employee_id = ?', email, nowIso(), id);
  }

  const next = {
    firstName: patch.firstName ?? row.first_name,
    lastName: patch.lastName ?? row.last_name,
    email: patch.email ? String(patch.email).trim().toLowerCase() : row.email,
    phone: patch.phone ?? row.phone,
    address: patch.address ?? row.address,
    city: patch.city ?? row.city,
    gender: patch.gender ?? row.gender,
    dateOfBirth: patch.dateOfBirth ?? row.date_of_birth,
    cnic: patch.cnic ?? row.cnic,
    joinDate: patch.joinDate ?? row.join_date,
    exitDate: patch.exitDate === undefined ? row.exit_date : patch.exitDate || null,
    status: patch.status ?? row.status,
    employmentType: patch.employmentType ?? row.employment_type,
    departmentId: patch.departmentId === undefined ? row.department_id : patch.departmentId || null,
    designationId: patch.designationId === undefined ? row.designation_id : patch.designationId || null,
    managerId: patch.managerId === undefined ? row.manager_id : patch.managerId || null,
    basic: patch.basic === undefined ? row.basic : Number(patch.basic),
    houseRentPct: patch.houseRentPct ?? row.house_rent_pct,
    medicalPct: patch.medicalPct ?? row.medical_pct,
    otherAllowances: patch.otherAllowances === undefined ? row.other_allowances : Number(patch.otherAllowances),
    bankName: patch.bankName ?? row.bank_name,
    accountTitle: patch.accountTitle ?? row.account_title,
    accountNumber: patch.accountNumber ?? row.account_number,
    emergencyName: patch.emergencyName ?? row.emergency_name,
    emergencyPhone: patch.emergencyPhone ?? row.emergency_phone,
    emergencyRelation: patch.emergencyRelation ?? row.emergency_relation,
    notes: patch.notes ?? row.notes,
  };
  run(
    `UPDATE employees SET first_name=?, last_name=?, email=?, phone=?, address=?, city=?, gender=?,
       date_of_birth=?, cnic=?, join_date=?, exit_date=?, status=?, employment_type=?, department_id=?,
       designation_id=?, manager_id=?, basic=?, house_rent_pct=?, medical_pct=?, other_allowances=?,
       bank_name=?, account_title=?, account_number=?, emergency_name=?, emergency_phone=?,
       emergency_relation=?, notes=?, updated_at=? WHERE id=?`,
    next.firstName, next.lastName, next.email, next.phone, next.address, next.city, next.gender,
    next.dateOfBirth, next.cnic, next.joinDate, next.exitDate, next.status, next.employmentType,
    next.departmentId, next.designationId, next.managerId, next.basic, next.houseRentPct, next.medicalPct,
    next.otherAllowances, next.bankName, next.accountTitle, next.accountNumber, next.emergencyName,
    next.emergencyPhone, next.emergencyRelation, next.notes, nowIso(), id,
  );
  run('UPDATE users SET name = ?, updated_at = ? WHERE employee_id = ?',
    `${next.firstName} ${next.lastName}`, nowIso(), id);
  return getEmployeeById(id);
}

/** Self-service: employees may only edit their phone and address. */
export function updateOwnContact(employeeId, { phone, address, city, emergencyName, emergencyPhone, emergencyRelation }) {
  const row = findEmployeeRow(employeeId);
  if (!row) throw notFound('Employee profile not found.');
  run(
    `UPDATE employees SET phone=?, address=?, city=?, emergency_name=?, emergency_phone=?,
       emergency_relation=?, updated_at=? WHERE id=?`,
    phone ?? row.phone, address ?? row.address, city ?? row.city,
    emergencyName ?? row.emergency_name, emergencyPhone ?? row.emergency_phone,
    emergencyRelation ?? row.emergency_relation, nowIso(), employeeId,
  );
  return getEmployeeById(employeeId);
}

export function setEmployeeStatus(id, status) {
  const row = findEmployeeRow(id);
  if (!row) throw notFound('Employee not found.');
  const settings = Setting.getOrDefault();
  const exitDate = ['resigned', 'terminated'].includes(status) ? dateKey() : null;
  run('UPDATE employees SET status = ?, exit_date = ?, updated_at = ? WHERE id = ?', status, exitDate, nowIso(), id);
  run('UPDATE users SET is_active = ?, updated_at = ? WHERE employee_id = ?',
    status === 'active' || status === 'probation' ? 1 : 0, nowIso(), id);
  return { ...getEmployeeById(id), workingDaysPerWeek: 7 - (settings.weekendDays || []).length };
}

/** Everything the Employee-360 panel shows, in one round trip. */
export function employee360(id) {
  const employee = getEmployeeById(id);
  const settings = Setting.getOrDefault();
  const month = monthKey();
  const { startKey, endKey } = monthRange(month);
  const holidayKeys = all('SELECT date FROM holidays WHERE date >= ? AND date <= ?', startKey, endKey).map((h) => h.date);
  const workingDays = workingDaysInRange(startKey, endKey, settings.weekendDays, holidayKeys).length;

  const attendance = {
    present: get("SELECT count(*) AS c FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? AND status = 'present'", id, startKey, endKey).c,
    late: get("SELECT count(*) AS c FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? AND status = 'late'", id, startKey, endKey).c,
    halfDay: get("SELECT count(*) AS c FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? AND status = 'half_day'", id, startKey, endKey).c,
    totalMinutes: get('SELECT coalesce(sum(worked_minutes),0) AS s FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?', id, startKey, endKey).s,
    workingDays,
  };

  const leaveRows = all(
    `SELECT lt.id, lt.name, lt.code, lt.annual_quota, lt.unlimited, lt.color,
            coalesce(sum(CASE WHEN lr.status = 'approved' THEN lr.days ELSE 0 END), 0) AS used
     FROM leave_types lt
     LEFT JOIN leave_requests lr ON lr.leave_type_id = lt.id AND lr.employee_id = ?
       AND substr(lr.start_date, 1, 4) = ?
     WHERE lt.is_active = 1
     GROUP BY lt.id ORDER BY lt.name`,
    id, String(new Date().getFullYear()),
  ).map((r) => ({
    leaveTypeId: r.id,
    name: r.name,
    code: r.code,
    color: r.color,
    allocated: r.unlimited ? null : r.annual_quota,
    used: r.used,
    remaining: r.unlimited ? null : Math.max(0, r.annual_quota - r.used),
  }));

  const recentAttendance = all(
    'SELECT * FROM attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 10',
    id,
  ).map((r) => ({
    date: r.date,
    status: r.status,
    checkInAt: r.check_in_at,
    checkOutAt: r.check_out_at,
    workedMinutes: r.worked_minutes,
  }));

  const lastPayslip = get(
    `SELECT pi.*, pr.month, pr.status AS run_status FROM payroll_items pi
     JOIN payroll_runs pr ON pr.id = pi.run_id
     WHERE pi.employee_id = ? ORDER BY pr.month DESC LIMIT 1`,
    id,
  );

  return {
    employee,
    attendance,
    leaveBalances: leaveRows,
    recentAttendance,
    lastPayslip: lastPayslip
      ? { month: lastPayslip.month, net: lastPayslip.net, gross: lastPayslip.gross, status: lastPayslip.run_status }
      : null,
  };
}

/* ------------------------------- CSV import ------------------------------- */

export const CSV_COLUMNS = [
  'employeeCode', 'firstName', 'lastName', 'email', 'phone', 'department', 'designation',
  'joinDate', 'basic', 'status', 'employmentType', 'gender', 'city', 'address', 'cnic',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function employeeCsvTemplate() {
  return toCsv(
    CSV_COLUMNS.map((c) => ({ key: c, label: c })),
    [{
      employeeCode: 'EMP-0001', firstName: 'Ayesha', lastName: 'Khan', email: 'ayesha@company.com',
      phone: '03001234567', department: 'Engineering', designation: 'Software Engineer',
      joinDate: '2026-01-15', basic: '120000', status: 'active', employmentType: 'full_time',
      gender: 'female', city: 'Karachi', address: 'Block 6, PECHS', cnic: '42101-1234567-8',
    }],
  );
}

/**
 * CSV import with a dry-run pass (brief, M3): returns row + field + reason for
 * every problem, and only writes when dryRun is false and there are no errors.
 */
export function importEmployeesCsv(csvText, { dryRun = true } = {}) {
  const { records } = parseCsv(csvText);
  if (!records.length) throw unprocessable('The file has no data rows.');

  const errors = [];
  const prepared = [];
  const seenEmails = new Set();

  records.forEach((rec, index) => {
    const row = index + 2; // header is row 1
    const err = (field, reason) => errors.push({ row, field, reason, email: rec.email || '' });

    if (!rec.firstName) err('firstName', 'First name is required');
    if (!rec.lastName) err('lastName', 'Last name is required');
    if (!rec.email) err('email', 'Email is required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email)) err('email', 'Email is not valid');
    else if (seenEmails.has(rec.email.toLowerCase())) err('email', 'Duplicate email inside the file');
    else if (get('SELECT id FROM employees WHERE lower(email) = ?', rec.email.toLowerCase())) {
      err('email', 'An employee with this email already exists');
    }

    if (!rec.joinDate) err('joinDate', 'Join date is required');
    else if (!ISO_DATE.test(rec.joinDate)) err('joinDate', 'Use ISO date YYYY-MM-DD');

    const basic = Number(rec.basic);
    if (!rec.basic) err('basic', 'Basic salary is required');
    else if (!Number.isFinite(basic) || basic <= 0) err('basic', 'Basic salary must be greater than 0');

    let departmentId = null;
    if (rec.department) {
      const dept = get('SELECT id FROM departments WHERE lower(name) = lower(?)', rec.department);
      if (!dept) err('department', `Unknown department "${rec.department}"`);
      else departmentId = dept.id;
    }
    let designationId = null;
    if (rec.designation) {
      const dg = get('SELECT id FROM designations WHERE lower(title) = lower(?)', rec.designation);
      if (!dg) err('designation', `Unknown designation "${rec.designation}"`);
      else designationId = dg.id;
    }
    if (rec.status && !['active', 'probation', 'resigned', 'terminated'].includes(rec.status)) {
      err('status', 'Status must be active, probation, resigned or terminated');
    }
    if (rec.employeeCode && get('SELECT id FROM employees WHERE employee_code = ?', rec.employeeCode.toUpperCase())) {
      err('employeeCode', 'Employee code already exists');
    }

    seenEmails.add(String(rec.email || '').toLowerCase());
    prepared.push({ rec, departmentId, designationId });
  });

  if (dryRun || errors.length) {
    return {
      dryRun: true,
      totalRows: records.length,
      validRows: prepared.length - new Set(errors.map((e) => e.row)).size,
      errors,
      preview: prepared.slice(0, 10).map(({ rec }) => ({
        name: `${rec.firstName} ${rec.lastName}`.trim(),
        email: rec.email,
        department: rec.department,
        basic: Number(rec.basic) || 0,
      })),
    };
  }

  const now = nowIso();
  const results = prepared.map(({ rec, departmentId, designationId }) => {
    const employeeId = crypto.randomUUID();
    const code = (rec.employeeCode || `EMP-${Math.floor(Math.random() * 9000 + 1000)}`).toUpperCase();
    run(
      `INSERT INTO employees (id, employee_code, first_name, last_name, email, phone, address, city, gender,
        join_date, cnic, status, employment_type, department_id, designation_id, basic, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      employeeId, code, rec.firstName, rec.lastName, rec.email.toLowerCase(), rec.phone || '',
      rec.address || '', rec.city || '', rec.gender || 'undisclosed', rec.joinDate, rec.cnic || '',
      rec.status || 'active', rec.employmentType || 'full_time', departmentId, designationId,
      Number(rec.basic), now, now,
    );
    return { id: employeeId, code, email: rec.email };
  });

  return { dryRun: false, imported: results.length, errors: [], created: results };
}

export function employeesCsvExport() {
  const rows = all(`${EMPLOYEE_SELECT} ORDER BY e.employee_code`).map((r) => mapEmployee(r));
  return toCsv(
    [
      { key: 'employeeCode', label: 'employeeCode' },
      { key: 'firstName', label: 'firstName' },
      { key: 'lastName', label: 'lastName' },
      { key: 'email', label: 'email' },
      { key: 'phone', label: 'phone' },
      { get: (r) => r.departmentName || '', label: 'department' },
      { get: (r) => r.designationTitle || '', label: 'designation' },
      { get: (r) => (r.joinDate || '').slice(0, 10), label: 'joinDate' },
      { get: (r) => r.salary.basic, label: 'basic' },
      { key: 'status', label: 'status' },
      { key: 'employmentType', label: 'employmentType' },
      { key: 'gender', label: 'gender' },
      { key: 'city', label: 'city' },
      { key: 'address', label: 'address' },
      { key: 'cnic', label: 'cnic' },
    ],
    rows,
  );
}

/** Lightweight list used by dropdowns and the AI search tool. */
export function employeeOptions(q = '') {
  const like = `%${q}%`;
  return all(
    `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.email, d.name AS department_name
     FROM employees e LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.status IN ('active','probation') AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_code LIKE ?)
     ORDER BY e.first_name LIMIT 20`,
    like, like, like,
  ).map((r) => ({
    id: r.id,
    label: `${r.first_name} ${r.last_name} (${r.employee_code})`,
    email: r.email,
    department: r.department_name,
  }));
}

export const attendanceDatesInMonth = (employeeId, month) => {
  const { startKey, endKey } = monthRange(month);
  return eachDayKey(startKey, endKey);
};

export { daysBetween };
