import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, nowIso } from '../db/index.js';
import { asyncHandler, ok, created, assertSchema, notFound, conflict } from '../utils/http.js';
import { authorize } from '../middleware/auth.js';
import { recordAudit } from '../middleware/audit.js';
import { createUser, updatePassword, findUserById, publicUser, generateTempPasswordClient } from '../services/hr-users.helper.js';

const router = Router();

const listUsers = () =>
  all(
    `SELECT u.*, (e.first_name || ' ' || e.last_name) AS employee_name, e.employee_code
     FROM users u LEFT JOIN employees e ON e.id = u.employee_id ORDER BY u.role, u.name`,
  ).map((u) => ({ ...publicUser(u), employeeName: u.employee_name, employeeCode: u.employee_code }));

/** Admin-only: create HR logins, deactivate or reset any login (brief, M1/M2). */
router.get('/', authorize('admin'), (_req, res) => ok(res, listUsers()));

router.post(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({
        name: z.string().min(2, 'Name is required'),
        email: z.string().email('Enter a valid email'),
        password: z.string().min(8, 'Use at least 8 characters'),
        role: z.enum(['hr', 'admin']).default('hr'),
      }),
      req.body,
    );
    const user = await createUser({
      name: body.name,
      email: body.email,
      password: body.password,
      role: body.role,
      mustChangePassword: true,
    });
    await recordAudit(req, {
      action: 'user.create',
      entity: 'user',
      entityId: user.id,
      summary: `Created ${body.role} login for ${body.email}`,
    });
    created(res, publicUser(user));
  }),
);

router.patch(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(z.object({ isActive: z.boolean() }), req.body);
    const user = findUserById(req.params.id);
    if (!user) throw notFound('User not found.');
    if (user.role === 'admin' && !body.isActive) {
      const admins = get("SELECT count(*) AS c FROM users WHERE role = 'admin' AND is_active = 1").c;
      if (admins <= 1) throw conflict('You cannot deactivate the only Admin account.');
    }
    run('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?', body.isActive ? 1 : 0, nowIso(), user.id);
    await recordAudit(req, {
      action: body.isActive ? 'user.activate' : 'user.deactivate',
      entity: 'user',
      entityId: user.id,
      summary: `${body.isActive ? 'Activated' : 'Deactivated'} ${user.email}`,
    });
    ok(res, publicUser(findUserById(user.id)));
  }),
);

router.post(
  '/:id/reset-password',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const user = findUserById(req.params.id);
    if (!user) throw notFound('User not found.');
    const tempPassword = generateTempPasswordClient();
    await updatePassword(user.id, tempPassword, { mustChange: true });
    await recordAudit(req, {
      action: 'user.reset_password',
      entity: 'user',
      entityId: user.id,
      summary: `Temporary password issued for ${user.email}`,
    });
    ok(res, { tempPassword, email: user.email });
  }),
);

export default router;
