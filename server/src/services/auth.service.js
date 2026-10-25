import bcrypt from 'bcryptjs';
import { all, get, run, nowIso } from '../db/index.js';
import { Setting } from '../services/settings.service.js';
import { DEFAULT_TAX_SLABS } from '../db/schema.js';
import { env } from '../config/env.js';
import { badRequest, conflict, unprocessable } from '../utils/http.js';
import { dateKey } from '../utils/date.js';

export const ROLES = ['admin', 'hr', 'employee'];

export const publicUser = (row) =>
  row && {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    employeeId: row.employee_id || null,
    isActive: row.is_active === 1,
    mustChangePassword: row.must_change_password === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function findUserByEmail(email) {
  return get('SELECT * FROM users WHERE lower(email) = lower(?)', String(email || '').trim());
}

export function findUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', id);
}

export function assertStrongEnough(password) {
  if (!password || String(password).length < 8) {
    throw unprocessable('Password must be at least 8 characters.', { password: 'Too short' });
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw unprocessable('Password needs at least one letter and one number.', {
      password: 'Add a letter and a number',
    });
  }
}

export async function createUser({ name, email, password, role, employeeId = null, mustChangePassword = false }) {
  if (!ROLES.includes(role)) throw badRequest('Unknown role.');
  if (findUserByEmail(email)) throw conflict('An account with that email already exists.', { email: 'Already registered' });
  assertStrongEnough(password);
  const id = crypto.randomUUID();
  const now = nowIso();
  run(
    `INSERT INTO users (id, name, email, password_hash, role, employee_id, is_active,
       must_change_password, temp_password_issued_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,1,?,?,?,?)`,
    id,
    name.trim(),
    email.trim().toLowerCase(),
    await hashPassword(password),
    role,
    employeeId,
    mustChangePassword ? 1 : 0,
    mustChangePassword ? now : null,
    now,
    now,
  );
  return findUserById(id);
}

export async function updatePassword(userId, newPassword, { mustChange = false } = {}) {
  assertStrongEnough(newPassword);
  run(
    'UPDATE users SET password_hash = ?, must_change_password = ?, password_changed_at = ?, updated_at = ? WHERE id = ?',
    await hashPassword(newPassword),
    mustChange ? 1 : 0,
    nowIso(),
    nowIso(),
    userId,
  );
}

/** Has the company been set up yet? Drives the first-run wizard. */
export function setupStatus() {
  const settings = Setting.get();
  const admin = get("SELECT id, name, email FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
  return {
    needsSetup: !settings || !settings.setupCompletedAt,
    companyName: settings ? settings.companyName : null,
    adminEmail: admin ? admin.email : env.adminEmail,
    adminExists: Boolean(admin),
  };
}

/**
 * First-run setup. Creates the company settings, the first Admin account and
 * the standard leave types. Runs in one transaction so a failure leaves the
 * app still un-setup (judges can retry).
 */
export async function completeSetup({ companyName, adminName, adminEmail, adminPassword, company = {} }) {
  if (!setupStatus().needsSetup) throw conflict('This system is already set up. Please sign in.');
  if (!companyName || !adminName || !adminEmail || !adminPassword) {
    throw unprocessable('Company name, admin name, email and password are required.');
  }
  assertStrongEnough(adminPassword);
  if (findUserByEmail(adminEmail)) throw conflict('That email already has an account.');

  const now = nowIso();
  const settings = Setting.create({ companyName, ...company });
  const passwordHash = await hashPassword(adminPassword);
  const adminId = crypto.randomUUID();
  run(
    `INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
     VALUES (?,?,?,?,'admin',1,?,?)`,
    adminId, adminName.trim(), adminEmail.trim().toLowerCase(), passwordHash, now, now,
  );
  run('UPDATE settings SET setup_completed_at = ?, setup_by = ?, updated_at = ? WHERE id = ?',
    now, adminId, now, settings.id);
  Setting.invalidate();

  const { seedLeaveTypes } = await import('./org.service.js');
  seedLeaveTypes(adminId);

  return { adminId, settingsId: settings.id };
}

export const DEFAULT_PASSWORD_HINT = 'Use at least 8 characters with a letter and a number.';
export const defaultTaxSlabs = () => DEFAULT_TAX_SLABS;
export const allUsers = () => all('SELECT * FROM users ORDER BY created_at DESC');
export const todayKey = () => dateKey();
