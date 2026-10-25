import { all, get, run, nowIso } from '../db/index.js';
import { DEFAULT_LEAVE_TYPES } from '../db/schema.js';
import { conflict, notFound, unprocessable } from '../utils/http.js';

const now = nowIso;

export const mapDept = (row) =>
  row && {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    headId: row.head_id,
    headName: row.head_name || null,
    employeeCount: row.employee_count ?? undefined,
    isActive: row.is_active === 1,
  };

export const listDepartments = ({ includeInactive = false } = {}) =>
  all(
    `SELECT d.*, (SELECT count(*) FROM employees e WHERE e.department_id = d.id AND e.status IN ('active','probation')) AS employee_count
     FROM departments d ${includeInactive ? '' : 'WHERE d.is_active = 1'} ORDER BY d.name`,
  ).map(mapDept);

export function createDepartment({ name, code = '', description = '' }) {
  if (get('SELECT id FROM departments WHERE lower(name) = lower(?)', name)) {
    throw conflict('That department already exists.', { name: 'Already exists' });
  }
  const id = crypto.randomUUID();
  run(
    'INSERT INTO departments (id, name, code, description, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    id, name.trim(), (code || '').toUpperCase(), description, now(), now(),
  );
  return mapDept(get('SELECT * FROM departments WHERE id = ?', id));
}

export function updateDepartment(id, patch) {
  const row = get('SELECT * FROM departments WHERE id = ?', id);
  if (!row) throw notFound('Department not found.');
  run(
    'UPDATE departments SET name = ?, code = ?, description = ?, is_active = ?, updated_at = ? WHERE id = ?',
    patch.name ?? row.name,
    (patch.code ?? row.code).toUpperCase(),
    patch.description ?? row.description,
    patch.isActive === undefined ? row.is_active : patch.isActive ? 1 : 0,
    now(), id,
  );
  return mapDept(get('SELECT * FROM departments WHERE id = ?', id));
}

export function deleteDepartment(id) {
  const count = get("SELECT count(*) AS c FROM employees WHERE department_id = ? AND status IN ('active','probation')", id).c;
  if (count > 0) {
    throw unprocessable(`Move the ${count} employee(s) in this department before deleting it.`);
  }
  run('DELETE FROM departments WHERE id = ?', id);
}

export const mapDesignation = (row) =>
  row && { id: row.id, title: row.title, level: row.level, isActive: row.is_active === 1 };

export const listDesignations = () =>
  all('SELECT * FROM designations WHERE is_active = 1 ORDER BY title').map(mapDesignation);

export function createDesignation({ title, level = '' }) {
  if (get('SELECT id FROM designations WHERE lower(title) = lower(?)', title)) {
    throw conflict('That designation already exists.', { title: 'Already exists' });
  }
  const id = crypto.randomUUID();
  run('INSERT INTO designations (id, title, level, created_at, updated_at) VALUES (?,?,?,?,?)',
    id, title.trim(), level, now(), now());
  return mapDesignation(get('SELECT * FROM designations WHERE id = ?', id));
}

export function updateDesignation(id, patch) {
  const row = get('SELECT * FROM designations WHERE id = ?', id);
  if (!row) throw notFound('Designation not found.');
  run('UPDATE designations SET title = ?, level = ?, is_active = ?, updated_at = ? WHERE id = ?',
    patch.title ?? row.title, patch.level ?? row.level,
    patch.isActive === undefined ? row.is_active : patch.isActive ? 1 : 0, now(), id);
  return mapDesignation(get('SELECT * FROM designations WHERE id = ?', id));
}

export function deleteDesignation(id) {
  const count = get("SELECT count(*) AS c FROM employees WHERE designation_id = ? AND status IN ('active','probation')", id).c;
  if (count > 0) throw unprocessable(`This designation is assigned to ${count} employee(s).`);
  run('DELETE FROM designations WHERE id = ?', id);
}

export const mapLeaveType = (row) =>
  row && {
    id: row.id,
    name: row.name,
    code: row.code,
    annualQuota: row.annual_quota,
    isPaid: row.is_paid === 1,
    unlimited: row.unlimited === 1,
    color: row.color,
    requiresReason: row.requires_reason === 1,
    isActive: row.is_active === 1,
  };

export const listLeaveTypes = () =>
  all('SELECT * FROM leave_types WHERE is_active = 1 ORDER BY is_paid DESC, name').map(mapLeaveType);

export function createLeaveType(payload) {
  if (get('SELECT id FROM leave_types WHERE code = ?', String(payload.code || '').toUpperCase())) {
    throw conflict('That leave type code already exists.', { code: 'Already exists' });
  }
  const id = crypto.randomUUID();
  run(
    `INSERT INTO leave_types (id, name, code, annual_quota, is_paid, unlimited, color, requires_reason, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, payload.name.trim(), payload.code.toUpperCase(), payload.annualQuota ?? 0,
    payload.isPaid === false ? 0 : 1, payload.unlimited ? 1 : 0,
    payload.color || '#7C5CFF', payload.requiresReason === false ? 0 : 1, now(), now(),
  );
  return mapLeaveType(get('SELECT * FROM leave_types WHERE id = ?', id));
}

export function updateLeaveType(id, patch) {
  const row = get('SELECT * FROM leave_types WHERE id = ?', id);
  if (!row) throw notFound('Leave type not found.');
  run(
    `UPDATE leave_types SET name=?, annual_quota=?, is_paid=?, unlimited=?, color=?, requires_reason=?, is_active=?, updated_at=?
     WHERE id = ?`,
    patch.name ?? row.name, patch.annualQuota ?? row.annual_quota,
    patch.isPaid === undefined ? row.is_paid : patch.isPaid ? 1 : 0,
    patch.unlimited === undefined ? row.unlimited : patch.unlimited ? 1 : 0,
    patch.color ?? row.color,
    patch.requiresReason === undefined ? row.requires_reason : patch.requiresReason ? 1 : 0,
    patch.isActive === undefined ? row.is_active : patch.isActive ? 1 : 0,
    now(), id,
  );
  return mapLeaveType(get('SELECT * FROM leave_types WHERE id = ?', id));
}

export function deleteLeaveType(id) {
  const used = get('SELECT count(*) AS c FROM leave_requests WHERE leave_type_id = ?', id).c;
  if (used > 0) throw unprocessable('This leave type has requests attached — deactivate it instead.');
  run('DELETE FROM leave_types WHERE id = ?', id);
}

export const mapHoliday = (row) => row && { id: row.id, name: row.name, date: row.date, type: row.type };

export const listHolidays = (year) =>
  all(
    year ? 'SELECT * FROM holidays WHERE date LIKE ? ORDER BY date' : 'SELECT * FROM holidays ORDER BY date',
    ...(year ? [`${year}-%`] : []),
  ).map(mapHoliday);

export function createHoliday({ name, date, type = 'public' }) {
  if (get('SELECT id FROM holidays WHERE date = ?', date)) {
    throw conflict('A holiday already exists on that date.', { date: 'Already booked' });
  }
  const id = crypto.randomUUID();
  run('INSERT INTO holidays (id, name, date, type, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    id, name.trim(), date, type, now(), now());
  return mapHoliday(get('SELECT * FROM holidays WHERE id = ?', id));
}

export function deleteHoliday(id) {
  run('DELETE FROM holidays WHERE id = ?', id);
}

/** Creates the four standard leave types once, during first-run setup. */
export function seedLeaveTypes() {
  const existing = get('SELECT count(*) AS c FROM leave_types').c;
  if (existing > 0) return;
  for (const t of DEFAULT_LEAVE_TYPES) {
    run(
      `INSERT INTO leave_types (id, name, code, annual_quota, is_paid, unlimited, color, requires_reason, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,1,?,?)`,
      crypto.randomUUID(), t.name, t.code, t.annualQuota, t.isPaid, t.unlimited || 0, t.color, now(), now(),
    );
  }
}

/** Organisation setup summary for the Admin screen. */
export function orgSummary() {
  return {
    departments: get('SELECT count(*) AS c FROM departments WHERE is_active = 1').c,
    designations: get('SELECT count(*) AS c FROM designations WHERE is_active = 1').c,
    leaveTypes: get('SELECT count(*) AS c FROM leave_types WHERE is_active = 1').c,
    holidays: get('SELECT count(*) AS c FROM holidays').c,
    users: get('SELECT count(*) AS c FROM users WHERE is_active = 1').c,
  };
}
