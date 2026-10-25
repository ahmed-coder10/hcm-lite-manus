import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, created, assertSchema, forbidden, notFound } from '../utils/http.js';
import { authorize } from '../middleware/auth.js';
import { recordAudit } from '../middleware/audit.js';
import {
  listEmployees, getEmployeeById, createEmployee, updateEmployee, setEmployeeStatus,
  employee360, importEmployeesCsv, employeesCsvExport, employeeCsvTemplate, employeeOptions,
  updateOwnContact, findEmployeeRow,
} from '../services/employees.service.js';

const router = Router();

const employeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', 'undisclosed']).optional(),
  dateOfBirth: z.string().nullable().optional(),
  cnic: z.string().optional(),
  joinDate: z.string().min(4, 'Join date is required'),
  exitDate: z.string().nullable().optional(),
  status: z.enum(['active', 'probation', 'resigned', 'terminated']).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  departmentId: z.string().nullable().optional(),
  designationId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  employeeCode: z.string().optional(),
  basic: z.coerce.number().min(1, 'Basic salary is required'),
  houseRentPct: z.coerce.number().min(0).max(100).optional(),
  medicalPct: z.coerce.number().min(0).max(100).optional(),
  otherAllowances: z.coerce.number().min(0).optional(),
  bankName: z.string().optional(),
  accountTitle: z.string().optional(),
  accountNumber: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  emergencyRelation: z.string().optional(),
  notes: z.string().optional(),
});

/** Employee self-service: only their own phone / address / emergency contact. */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.auth.employeeId) throw notFound('This account is not linked to an employee profile.');
    ok(res, employee360(req.auth.employeeId));
  }),
);

router.patch(
  '/me/contact',
  asyncHandler(async (req, res) => {
    if (!req.auth.employeeId) throw notFound('This account is not linked to an employee profile.');
    const body = assertSchema(
      z.object({
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        emergencyName: z.string().optional(),
        emergencyPhone: z.string().optional(),
        emergencyRelation: z.string().optional(),
      }),
      req.body,
    );
    const updated = updateOwnContact(req.auth.employeeId, body);
    await recordAudit(req, {
      action: 'employee.update_own_contact',
      entity: 'employee',
      entityId: req.auth.employeeId,
      summary: 'Updated own contact details',
    });
    ok(res, updated);
  }),
);

router.get(
  '/options',
  authorize('admin', 'hr'),
  (req, res) => ok(res, employeeOptions(req.query.q || '')),
);

router.get(
  '/import/template',
  authorize('admin', 'hr'),
  (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employee-import-template.csv"');
    res.send(employeeCsvTemplate());
  },
);

router.get(
  '/export',
  authorize('admin', 'hr'),
  (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="employees-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(employeesCsvExport());
  },
);

router.post(
  '/import',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(z.object({ csv: z.string().min(1), dryRun: z.boolean().optional() }), req.body);
    const result = importEmployeesCsv(body.csv, { dryRun: body.dryRun !== false });
    if (!result.dryRun) {
      await recordAudit(req, {
        action: 'employee.import',
        entity: 'employee',
        summary: `Imported ${result.imported} employee(s) from CSV`,
      });
    }
    ok(res, result);
  }),
);

router.get(
  '/',
  authorize('admin', 'hr'),
  (req, res) => {
    const { q, departmentId, status, employmentType, page, limit, sort } = req.query;
    ok(res, listEmployees({ q, departmentId, status, employmentType, page, limit, sort }));
  },
);

router.post(
  '/',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(employeeSchema, req.body);
    const { employee, tempPassword } = await createEmployee(body, req.user);
    await recordAudit(req, {
      action: 'employee.create',
      entity: 'employee',
      entityId: employee.id,
      summary: `Registered ${employee.fullName} (${employee.employeeCode})`,
      after: { name: employee.fullName, department: employee.departmentName, basic: employee.salary.basic },
    });
    created(res, { employee, tempPassword });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.auth.role === 'employee' && req.auth.employeeId !== req.params.id) {
      throw forbidden('You can only view your own profile.');
    }
    const data = employee360(req.params.id);
    if (req.auth.role === 'employee') {
      // Employees never see the salary breakdown of anyone else — and that
      // includes their own colleagues; their own salary is fine.
      return ok(res, data);
    }
    return ok(res, data);
  }),
);

router.patch(
  '/:id',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const before = findEmployeeRow(req.params.id);
    if (!before) throw notFound('Employee not found.');
    const patch = assertSchema(employeeSchema.partial(), req.body);
    const employee = updateEmployee(req.params.id, patch);
    await recordAudit(req, {
      action: 'employee.update',
      entity: 'employee',
      entityId: employee.id,
      summary: `Updated ${employee.fullName}`,
      before: { basic: before.basic, departmentId: before.department_id, status: before.status },
      after: { basic: employee.salary.basic, departmentId: employee.departmentId, status: employee.status },
    });
    ok(res, employee);
  }),
);

router.patch(
  '/:id/status',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({ status: z.enum(['active', 'probation', 'resigned', 'terminated']) }),
      req.body,
    );
    const employee = setEmployeeStatus(req.params.id, body.status);
    await recordAudit(req, {
      action: 'employee.status',
      entity: 'employee',
      entityId: employee.id,
      summary: `${employee.fullName} marked ${body.status}`,
    });
    ok(res, employee);
  }),
);

router.get('/:id/profile', asyncHandler(async (req, res) => ok(res, getEmployeeById(req.params.id))));

export default router;
