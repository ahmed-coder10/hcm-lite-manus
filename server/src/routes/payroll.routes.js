import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, created, assertSchema, forbidden, unprocessable } from '../utils/http.js';
import { authorize } from '../middleware/auth.js';
import { recordAudit } from '../middleware/audit.js';
import {
  listRuns, getRun, createDraft, finalizeRun, computePayroll, payslipFor, myPayslips,
  streamPayslip, getRunByMonth, assertMonth,
} from '../services/payroll.service.js';
import { Setting } from '../services/settings.service.js';
import { monthKey } from '../utils/date.js';

const router = Router();

router.get('/runs', authorize('admin', 'hr'), (_req, res) => ok(res, listRuns()));

router.get('/runs/:id', authorize('admin', 'hr'), (req, res) => ok(res, getRun(req.params.id)));

router.get('/preview', authorize('admin', 'hr'), (req, res) => {
  const month = assertMonth(req.query.month || monthKey());
  const preview = computePayroll(month);
  const existing = getRunByMonth(month);
  ok(res, { ...preview, existingRun: existing ? { id: existing.id, status: existing.status } : null });
});

router.post(
  '/runs',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM') }), req.body);
    const run = createDraft(body.month, req.auth.userId);
    await recordAudit(req, {
      action: 'payroll.create',
      entity: 'payroll_run',
      entityId: run.id,
      summary: `Draft payroll for ${run.month} (${run.employeeCount} employees, net ${run.totals.net})`,
    });
    created(res, run);
  }),
);

router.post(
  '/runs/:id/finalize',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const run = finalizeRun(req.params.id, req.auth.userId);
    await recordAudit(req, {
      action: 'payroll.finalize',
      entity: 'payroll_run',
      entityId: run.id,
      summary: `Finalized payroll for ${run.month} — locked`,
      after: { month: run.month, net: run.totals.net },
    });
    ok(res, run);
  }),
);

router.get(
  '/me/payslips',
  asyncHandler(async (req, res) => {
    if (!req.auth.employeeId) return ok(res, []);
    ok(res, myPayslips(req.auth.employeeId));
  }),
);

router.get(
  '/payslips/:id.pdf',
  asyncHandler(async (req, res) => {
    const employeeId = req.auth.role === 'employee' ? req.auth.employeeId : null;
    const payslip = payslipFor({ itemId: req.params.id, employeeId });
    streamPayslip(res, payslip, Setting.getOrDefault());
  }),
);

router.get(
  '/runs/:id/csv',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const run = getRun(req.params.id);
    const header = 'Code,Name,Department,WorkingDays,Present,Late,Absent,HalfDay,Gross,Deductions,Tax,Net';
    const lines = run.items.map((i) =>
      [i.employeeCode, i.employeeName, i.department, i.workingDays, i.presentDays, i.lateDays, i.absentDays,
        i.halfDays, i.gross, i.totalDeductions, i.tax, i.net].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${run.month}.csv"`);
    res.send([header, ...lines].join('\n'));
  }),
);

export default router;
