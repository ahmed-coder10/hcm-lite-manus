import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, unauthorized, assertSchema, forbidden } from '../utils/http.js';
import {
  findUserByEmail, findUserById, verifyPassword, publicUser, updatePassword,
} from '../services/auth.service.js';
import { signToken, authenticate } from '../middleware/auth.js';
import { recordAudit } from '../middleware/audit.js';
import { getEmployeeById } from '../services/employees.service.js';
import { publicSettings } from '../services/settings.service.js';
import { unreadCount } from '../services/notify.service.js';
import { nowIso, run } from '../db/index.js';
import { aiStatus } from '../services/ai.service.js';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password is required') }),
      req.body,
    );
    const user = findUserByEmail(body.email);
    // Same message for unknown email and wrong password — no account probing.
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      throw unauthorized('Email or password is incorrect.');
    }
    if (!user.is_active) throw forbidden('This account is deactivated. Contact your administrator.');

    run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), user.id);
    const token = signToken(user);
    res.json({ data: { token, user: publicUser(user), mustChangePassword: user.must_change_password === 1 } });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const employee = req.auth.employeeId ? getEmployeeById(req.auth.employeeId) : null;
    ok(res, {
      user: publicUser(req.user),
      employee,
      settings: publicSettings(),
      notifications: { unread: unreadCount(req.auth.userId) },
      ai: aiStatus(),
    });
  }),
);

router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({
        currentPassword: z.string().min(1, 'Enter your current password'),
        newPassword: z.string().min(8, 'Use at least 8 characters'),
      }),
      req.body,
    );
    const user = findUserById(req.auth.userId);
    if (!(await verifyPassword(body.currentPassword, user.password_hash))) {
      throw forbidden('Your current password is not correct.');
    }
    await updatePassword(user.id, body.newPassword);
    await recordAudit(req, { action: 'auth.change_password', entity: 'user', entityId: user.id, summary: 'Password changed' });
    ok(res, { message: 'Password updated.' });
  }),
);

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await recordAudit(req, { action: 'auth.logout', entity: 'user', entityId: req.auth.userId, summary: 'Signed out' });
    res.json({ data: { message: 'Signed out.' } });
  }),
);

export default router;
