import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, created, assertSchema } from '../utils/http.js';
import { authorize } from '../middleware/auth.js';
import { recordAudit } from '../middleware/audit.js';
import { Setting, publicSettings } from '../services/settings.service.js';
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listDesignations, createDesignation, updateDesignation, deleteDesignation,
  listLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
  listHolidays, createHoliday, deleteHoliday, orgSummary,
} from '../services/org.service.js';

const router = Router();

/* --------------------------------- settings -------------------------------- */

router.get('/settings', (_req, res) => ok(res, Setting.getOrDefault()));

router.put(
  '/settings',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      companyName: z.string().min(2).optional(),
      legalName: z.string().optional(),
      officeStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      officeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      graceMinutes: z.coerce.number().min(0).max(120).optional(),
      halfDayHours: z.coerce.number().min(1).max(12).optional(),
      workdayHours: z.coerce.number().min(1).max(24).optional(),
      weekendDays: z.array(z.number().min(0).max(6)).optional(),
      office: z
        .object({
          lat: z.number().nullable().optional(),
          lng: z.number().nullable().optional(),
          radius: z.coerce.number().min(20).max(5000).optional(),
          label: z.string().optional(),
        })
        .optional(),
      maxGpsAccuracy: z.coerce.number().min(10).max(1000).optional(),
      latePenalty: z.boolean().optional(),
    });
    const body = assertSchema(schema, req.body);
    const before = Setting.get();
    const after = Setting.update(body);
    await recordAudit(req, {
      action: 'settings.update',
      entity: 'settings',
      entityId: after.id,
      summary: 'Company settings updated',
      before: { officeStart: before.officeStart, graceMinutes: before.graceMinutes },
      after: { officeStart: after.officeStart, graceMinutes: after.graceMinutes },
    });
    ok(res, after);
  }),
);

router.get('/summary', authorize('admin', 'hr'), (req, res) => ok(res, orgSummary()));

/* -------------------------------- departments ------------------------------- */

router.get('/departments', (req, res) =>
  ok(res, listDepartments({ includeInactive: req.query.includeInactive === 'true' })),
);

router.post(
  '/departments',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({ name: z.string().min(2, 'Name is required'), code: z.string().optional(), description: z.string().optional() }),
      req.body,
    );
    const dept = createDepartment(body);
    await recordAudit(req, { action: 'department.create', entity: 'department', entityId: dept.id, summary: `Created ${dept.name}` });
    created(res, dept);
  }),
);

router.patch(
  '/departments/:id',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const dept = updateDepartment(req.params.id, req.body);
    await recordAudit(req, { action: 'department.update', entity: 'department', entityId: dept.id, summary: `Updated ${dept.name}` });
    ok(res, dept);
  }),
);

router.delete(
  '/departments/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    deleteDepartment(req.params.id);
    await recordAudit(req, { action: 'department.delete', entity: 'department', entityId: req.params.id, summary: 'Deleted department' });
    res.json({ data: { message: 'Department deleted.' } });
  }),
);

/* ------------------------------- designations ------------------------------- */

router.get('/designations', (_req, res) => ok(res, listDesignations()));

router.post(
  '/designations',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(z.object({ title: z.string().min(2), level: z.string().optional() }), req.body);
    const d = createDesignation(body);
    await recordAudit(req, { action: 'designation.create', entity: 'designation', entityId: d.id, summary: `Created ${d.title}` });
    created(res, d);
  }),
);

router.patch(
  '/designations/:id',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => ok(res, updateDesignation(req.params.id, req.body))),
);

router.delete(
  '/designations/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    deleteDesignation(req.params.id);
    res.json({ data: { message: 'Designation deleted.' } });
  }),
);

/* -------------------------------- leave types ------------------------------- */

router.get('/leave-types', (_req, res) => ok(res, listLeaveTypes()));

router.post(
  '/leave-types',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({
        name: z.string().min(2),
        code: z.string().min(2).max(12),
        annualQuota: z.coerce.number().min(0).default(0),
        isPaid: z.boolean().optional(),
        unlimited: z.boolean().optional(),
        color: z.string().optional(),
        requiresReason: z.boolean().optional(),
      }),
      req.body,
    );
    const t = createLeaveType(body);
    await recordAudit(req, { action: 'leave_type.create', entity: 'leave_type', entityId: t.id, summary: `Created ${t.name}` });
    created(res, t);
  }),
);

router.patch(
  '/leave-types/:id',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => ok(res, updateLeaveType(req.params.id, req.body))),
);

router.delete(
  '/leave-types/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    deleteLeaveType(req.params.id);
    res.json({ data: { message: 'Leave type deleted.' } });
  }),
);

/* --------------------------------- holidays -------------------------------- */

router.get('/holidays', (req, res) => ok(res, listHolidays(req.query.year)));

router.post(
  '/holidays',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({
        name: z.string().min(2),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
        type: z.enum(['public', 'company', 'optional']).optional(),
      }),
      req.body,
    );
    const h = createHoliday(body);
    await recordAudit(req, { action: 'holiday.create', entity: 'holiday', entityId: h.id, summary: `${h.name} on ${h.date}` });
    created(res, h);
  }),
);

router.delete(
  '/holidays/:id',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    deleteHoliday(req.params.id);
    res.json({ data: { message: 'Holiday removed.' } });
  }),
);

export default router;
