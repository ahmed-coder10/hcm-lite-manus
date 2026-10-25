import { Router } from 'express';
import { asyncHandler, ok, forbidden } from '../utils/http.js';
import { dashboardFor, kpiSnapshot } from '../services/analytics.service.js';
import { dateKey } from '../utils/date.js';

const router = Router();

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const { role, employeeId } = req.auth;
    if (role === 'employee' && !employeeId) {
      throw forbidden('This account is not linked to an employee profile.');
    }
    const data = dashboardFor(role, employeeId, {
      startKey: req.query.from || undefined,
      endKey: req.query.to || undefined,
      departmentId: req.query.departmentId || null,
    });
    ok(res, data);
  }),
);

router.get('/kpi', (req, res) =>
  ok(res, kpiSnapshot({ role: req.auth.role, employeeId: req.auth.employeeId })),
);

router.get('/today', (_req, res) => ok(res, { date: dateKey() }));

export default router;
