import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, created, assertSchema, forbidden, unprocessable } from '../utils/http.js';
import { authorize } from '../middleware/auth.js';
import { recordAudit } from '../middleware/audit.js';
import {
  applyLeave, balancesFor, decideLeave, getLeave, listLeave, cancelLeave, whoIsOnLeave, leaveSummary,
} from '../services/leave.service.js';
import { dateKey, monthRange } from '../utils/date.js';

const router = Router();

router.get('/types', asyncHandler(async (_req, res) => {
  const { listLeaveTypes } = await import('../services/org.service.js');
  ok(res, listLeaveTypes());
}));

router.get(
  '/balances',
  asyncHandler(async (req, res) => {
    const employeeId = req.query.employeeId && ['admin', 'hr'].includes(req.auth.role)
      ? req.query.employeeId
      : req.auth.employeeId;
    if (!employeeId) throw unprocessable('This account is not linked to an employee profile.');
    ok(res, balancesFor(employeeId, Number(req.query.year) || new Date().getFullYear()));
  }),
);

router.get(
  '/summary',
  authorize('admin', 'hr'),
  (req, res) => {
    const today = dateKey();
    const startKey = req.query.from || `${today.slice(0, 7)}-01`;
    const endKey = req.query.to || today;
    ok(res, leaveSummary({ startKey, endKey }));
  },
);

router.get('/on-leave-today', authorize('admin', 'hr'), (_req, res) => ok(res, whoIsOnLeave(dateKey())));

router.get(
  '/inbox',
  authorize('admin', 'hr'),
  (req, res) =>
    ok(res, listLeave({ status: req.query.status || 'pending', departmentId: req.query.departmentId || null, limit: req.query.limit })),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isStaff = ['admin', 'hr'].includes(req.auth.role);
    const employeeId = isStaff
      ? req.query.employeeId || null
      : req.auth.employeeId;
    if (!isStaff && !employeeId) throw forbidden('This account is not linked to an employee profile.');
    ok(res, listLeave({
      employeeId,
      status: req.query.status || 'all',
      departmentId: req.query.departmentId || null,
      year: req.query.year || null,
      limit: req.query.limit,
    }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({
        leaveTypeId: z.string().min(1, 'Choose a leave type'),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
        reason: z.string().min(5, 'Add a short reason'),
        appliedVia: z.enum(['web', 'ai']).optional(),
        employeeId: z.string().optional(),
      }),
      req.body,
    );
    const isStaff = ['admin', 'hr'].includes(req.auth.role);
    const employeeId = isStaff && body.employeeId ? body.employeeId : req.auth.employeeId;
    if (!employeeId) throw unprocessable('This account is not linked to an employee profile.');
    if (!isStaff && body.employeeId && body.employeeId !== req.auth.employeeId) {
      throw forbidden('You can only apply for your own leave.');
    }
    const leave = applyLeave({
      employeeId,
      leaveTypeId: body.leaveTypeId,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
      appliedVia: body.appliedVia || 'web',
    });
    await recordAudit(req, {
      action: 'leave.apply',
      entity: 'leave_request',
      entityId: leave.id,
      summary: `${leave.days} day(s) ${leave.leaveTypeName || ''} leave ${leave.startDate} → ${leave.endDate}`,
    });
    created(res, leave);
  }),
);

router.patch(
  '/:id/decision',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({ decision: z.enum(['approved', 'rejected']), comment: z.string().optional() }),
      req.body,
    );
    const leave = decideLeave({
      id: req.params.id,
      decision: body.decision,
      comment: body.comment || '',
      actorUserId: req.auth.userId,
      req,
    });
    ok(res, leave);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const isStaff = ['admin', 'hr'].includes(req.auth.role);
    const leave = cancelLeave({ id: req.params.id, employeeId: req.auth.employeeId, isStaff });
    await recordAudit(req, {
      action: 'leave.cancel',
      entity: 'leave_request',
      entityId: leave.id,
      summary: 'Cancelled leave request',
    });
    ok(res, leave);
  }),
);

router.get('/:id', asyncHandler(async (req, res) => {
  const leave = getLeave(req.params.id);
  if (req.auth.role === 'employee' && leave.employeeId !== req.auth.employeeId) {
    throw forbidden('You can only view your own leave requests.');
  }
  ok(res, leave);
}));

export { monthRange };
export default router;
