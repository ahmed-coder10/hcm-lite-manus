import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { get } from '../db/index.js';
import { unauthorized, forbidden } from '../utils/http.js';

export function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      employeeId: user.employee_id ? String(user.employee_id) : null,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

/**
 * Verifies the JWT and re-reads the user on every request, so a deactivated
 * account loses access immediately. All RBAC and data-scope checks happen here
 * and in the route guards — never in the browser.
 */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return next(unauthorized('Your session expired. Please sign in again.'));
  }

  const user = get('SELECT * FROM users WHERE id = ?', payload.sub);
  if (!user || user.is_active !== 1) {
    return next(unauthorized('This account is inactive. Contact your administrator.'));
  }

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    employee_id: user.employee_id,
    must_change_password: user.must_change_password === 1,
  };
  req.auth = {
    role: user.role,
    userId: user.id,
    employeeId: user.employee_id || null,
  };
  return next();
}

/** Route guard: `authorize('admin', 'hr')` */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (roles.length && !roles.includes(req.user.role)) return next(forbidden());
    return next();
  };

/** Employees may only ever touch rows that belong to them. */
export function assertSelfOrStaff(req, employeeId) {
  if (['admin', 'hr'].includes(req.auth.role)) return;
  if (String(employeeId) !== String(req.auth.employeeId)) {
    throw forbidden('You can only access your own records.');
  }
}
