import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, created, assertSchema, forbidden, unprocessable } from '../utils/http.js';
import { authorize } from '../middleware/auth.js';
import { recordAudit } from '../middleware/audit.js';
import {
  checkIn, checkOut, myToday, attendanceCalendar, dailyBoard, attendanceSummary,
  requestCorrection, listCorrections, decideCorrection,
} from '../services/attendance.service.js';
import { dateKey } from '../utils/date.js';

const router = Router();

const locationSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100000).optional(),
  })
  .nullable()
  .optional();

const resolveEmployeeId = (req, explicit) => {
  if (explicit && ['admin', 'hr'].includes(req.auth.role)) return explicit;
  if (!req.auth.employeeId) throw unprocessable('This account is not linked to an employee profile.');
  return req.auth.employeeId;
};

router.get('/me/today', (req, res) => ok(res, myToday(resolveEmployeeId(req))));

router.post(
  '/check-in',
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({
        source: z.enum(['web', 'camera']).default('web'),
        location: locationSchema,
        faceVerified: z.boolean().optional(),
      }),
      req.body || {},
    );
    const employeeId = resolveEmployeeId(req, req.body.employeeId);
    const result = checkIn({
      employeeId,
      source: body.source,
      location: body.location || null,
      faceVerified: Boolean(body.faceVerified),
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });
    await recordAudit(req, {
      action: 'attendance.check_in',
      entity: 'attendance',
      entityId: result.record.id,
      summary: `Checked in at ${result.record.checkInTime}${result.late ? ' (late)' : ''}`,
    });
    created(res, {
      ...result,
      message: result.late
        ? `Checked in at ${result.record.checkInTime} — that is after the grace window, so today is marked late.`
        : `Checked in at ${result.record.checkInTime}. Have a good day.`,
    });
  }),
);

router.post(
  '/check-out',
  asyncHandler(async (req, res) => {
    const body = assertSchema(z.object({ location: locationSchema }), req.body || {});
    const employeeId = resolveEmployeeId(req, req.body.employeeId);
    const result = checkOut({
      employeeId,
      location: body.location || null,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });
    await recordAudit(req, {
      action: 'attendance.check_out',
      entity: 'attendance',
      entityId: result.record.id,
      summary: `Checked out at ${result.record.checkOutTime} (${result.workedMinutes} min)`,
    });
    ok(res, result);
  }),
);

router.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const employeeId = resolveEmployeeId(req, req.query.employeeId);
    if (req.query.employeeId && req.auth.role === 'employee' && req.query.employeeId !== req.auth.employeeId) {
      throw forbidden('You can only view your own attendance.');
    }
    const month = req.query.month || dateKey().slice(0, 7);
    ok(res, attendanceCalendar(employeeId, month));
  }),
);

router.get('/board', authorize('admin', 'hr'), (req, res) =>
  ok(res, dailyBoard(req.query.date || dateKey(), { departmentId: req.query.departmentId || null })),
);

router.get('/summary', authorize('admin', 'hr'), (req, res) => {
  const today = dateKey();
  const startKey = req.query.from || `${today.slice(0, 7)}-01`;
  const endKey = req.query.to || today;
  ok(res, attendanceSummary({ startKey, endKey, departmentId: req.query.departmentId || null }));
});

router.get('/late-comers', authorize('admin', 'hr'), (req, res) => {
  const today = dateKey();
  const summary = attendanceSummary({
    startKey: req.query.from || `${today.slice(0, 7)}-01`,
    endKey: req.query.to || today,
    departmentId: req.query.departmentId || null,
  });
  ok(res, summary.perEmployee.sort((a, b) => b.late - a.late).slice(0, 10));
});

/* ------------------------------- corrections ------------------------------- */

router.post(
  '/corrections',
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
        requestedCheckIn: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')).optional(),
        requestedCheckOut: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')).optional(),
        reason: z.string().min(5, 'Tell HR what needs fixing'),
      }),
      req.body,
    );
    const employeeId = resolveEmployeeId(req, req.body.employeeId);
    const correction = requestCorrection({ employeeId, ...body });
    await recordAudit(req, {
      action: 'attendance.correction_request',
      entity: 'attendance_correction',
      entityId: correction.id,
      summary: `Requested a correction for ${body.date}`,
    });
    created(res, correction);
  }),
);

router.get(
  '/corrections',
  asyncHandler(async (req, res) => {
    const isStaff = ['admin', 'hr'].includes(req.auth.role);
    if (!isStaff && !req.auth.employeeId) return ok(res, []);
    ok(
      res,
      listCorrections({
        employeeId: isStaff ? req.query.employeeId || null : req.auth.employeeId,
        status: req.query.status || null,
        limit: req.query.limit,
      }),
    );
  }),
);

router.patch(
  '/corrections/:id',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({ decision: z.enum(['approved', 'rejected']), comment: z.string().optional() }),
      req.body,
    );
    const correction = decideCorrection({
      id: req.params.id,
      decision: body.decision,
      comment: body.comment || '',
      actorUserId: req.auth.userId,
    });
    await recordAudit(req, {
      action: `attendance.correction_${body.decision}`,
      entity: 'attendance_correction',
      entityId: req.params.id,
      summary: `${body.decision} attendance correction`,
    });
    ok(res, correction);
  }),
);

export default router;
