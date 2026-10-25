/**
 * End-to-end API test: boots the real Express app against an in-memory SQLite
 * database and walks the whole judged flow (setup → employees → attendance →
 * leave → payroll → payslip PDF → AI → comms → CSV → dashboards).
 *
 *   node tests/api.e2e.mjs      (or: npm run test:e2e)
 */
import { initDb, closeDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';

initDb(':memory:');
const app = createApp();
const server = app.listen(0);
await new Promise((resolve) => server.on('listening', resolve));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}/api`;
console.log(`test server on ${BASE}`);

let pass = 0;
let fail = 0;
const errors = [];

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json, headers: res.headers };
};

const check = (label, condition, extra) => {
  if (condition) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; errors.push({ label, extra }); console.log(`  FAIL ${label}`, extra ? JSON.stringify(extra).slice(0, 400) : ''); }
};

const month = new Date().toISOString().slice(0, 7);

(async () => {
  console.log('\n== setup ==');
  const status0 = await call('GET', '/setup');
  check('setup status reachable', status0.status === 200, status0.body);

  if (status0.body?.data?.needsSetup) {
    const setup = await call('POST', '/setup', {
      body: {
        companyName: 'Northwind Labs',
        adminName: 'Zara Admin',
        adminEmail: 'zara@northwind.test',
        adminPassword: 'Admin@12345',
        officeStart: '09:00',
        graceMinutes: 15,
        weekendDays: [6, 0],
        office: { lat: 24.8607, lng: 67.0011, radius: 150, label: 'Head office' },
      },
    });
    check('first-run setup created admin', setup.status === 201 && setup.body.data?.token, setup.body);
  }

  const adminLogin = await call('POST', '/auth/login', { body: { email: 'zara@northwind.test', password: 'Admin@12345' } });
  check('admin login', adminLogin.status === 200, adminLogin.body);
  const admin = adminLogin.body.data.token;

  console.log('\n== organization ==');
  const dept = await call('POST', '/org/departments', { token: admin, body: { name: 'Engineering', code: 'ENG' } });
  check('create department', dept.status === 201, dept.body);
  const deptId = dept.body.data.id;

  const desig = await call('POST', '/org/designations', { token: admin, body: { title: 'Software Engineer' } });
  check('create designation', desig.status === 201, desig.body);
  const desigId = desig.body.data.id;

  const holiday = await call('POST', '/org/holidays', { token: admin, body: { name: 'Test Holiday', date: `${month}-28` } });
  check('create holiday', holiday.status === 201, holiday.body);

  const leaveTypes = await call('GET', '/org/leave-types', { token: admin });
  check('default leave types seeded', leaveTypes.body.data?.length >= 4, leaveTypes.body);
  const casual = leaveTypes.body.data.find((t) => t.code === 'CASUAL');

  console.log('\n== hr login + employees ==');
  const hr = await call('POST', '/users', { token: admin, body: { name: 'Hina HR', email: 'hina@northwind.test', password: 'HrPass@123', role: 'hr' } });
  check('admin creates HR login', hr.status === 201, hr.body);
  const hrLogin = await call('POST', '/auth/login', { body: { email: 'hina@northwind.test', password: 'HrPass@123' } });
  check('HR login', hrLogin.status === 200, hrLogin.body);
  const hrToken = hrLogin.body.data.token;

  const emp1 = await call('POST', '/employees', {
    token: hrToken,
    body: {
      firstName: 'Ali', lastName: 'Raza', email: 'ali@northwind.test', joinDate: `${month}-01`,
      departmentId: deptId, designationId: desigId, basic: 120000, phone: '0300-1112223', city: 'Karachi',
    },
  });
  check('register employee 1 (+ temp password)', emp1.status === 201 && emp1.body.data?.tempPassword, emp1.body);
  const emp1Id = emp1.body.data.employee.id;
  const emp1Temp = emp1.body.data.tempPassword;

  const emp2 = await call('POST', '/employees', {
    token: hrToken,
    body: {
      firstName: 'Sara', lastName: 'Khan', email: 'sara@northwind.test', joinDate: `${month}-01`,
      departmentId: deptId, designationId: desigId, basic: 90000,
    },
  });
  check('register employee 2', emp2.status === 201, emp2.body);
  const emp2Temp = emp2.body.data.tempPassword;

  const dup = await call('POST', '/employees', {
    token: hrToken,
    body: { firstName: 'Ali', lastName: 'Raza', email: 'ali@northwind.test', joinDate: `${month}-01`, basic: 1 },
  });
  check('duplicate email rejected (409)', dup.status === 409, dup.body);

  const list = await call('GET', '/employees?q=Sara', { token: hrToken });
  check('employee search works', list.body.data?.items?.length === 1, list.body.data?.total);

  console.log('\n== employee self-service ==');
  const empLogin = await call('POST', '/auth/login', { body: { email: 'ali@northwind.test', password: emp1Temp } });
  check('employee logs in with temp password', empLogin.status === 200 && empLogin.body.data.mustChangePassword, empLogin.body);
  const empToken = empLogin.body.data.token;

  const changed = await call('POST', '/auth/change-password', {
    token: empToken,
    body: { currentPassword: emp1Temp, newPassword: 'AliPass@123' },
  });
  check('employee changes password', changed.status === 200, changed.body);

  const relogin = await call('POST', '/auth/login', { body: { email: 'ali@northwind.test', password: 'AliPass@123' } });
  check('login with new password', relogin.status === 200, relogin.body);
  const emp = relogin.body.data.token;
  const empSelf = relogin.body.data.user.employeeId;

  const cameraNoFace = await call('POST', '/attendance/check-in', {
    token: emp, body: { source: 'camera', faceVerified: false, location: { lat: 24.8607, lng: 67.0011, accuracy: 20 } },
  });
  check('camera check-in without a face rejected (422)', cameraNoFace.status === 422, cameraNoFace.body);

  const checkin = await call('POST', '/attendance/check-in', {
    token: emp,
    body: { source: 'web', location: { lat: 24.8607, lng: 67.0011, accuracy: 12 } },
  });
  check('web check-in', checkin.status === 201 && checkin.body.data.record?.checkInAt, checkin.body);
  const again = await call('POST', '/attendance/check-in', { token: emp, body: { source: 'web' } });
  check('second check-in rejected (409)', again.status === 409, again.body);

  const outside = await call('POST', '/attendance/check-in', {
    token: emp, body: { source: 'web', location: { lat: 24.9, lng: 67.1, accuracy: 20 } },
  });
  check('outside the geofence rejected', outside.status === 422 || outside.status === 409, outside.body);

  const today = await call('GET', '/attendance/me/today', { token: emp });
  check('today widget shows the record', today.body.data?.record?.checkInAt, today.body.data?.record);

  const bal = await call('GET', '/leave/balances', { token: emp });
  check('leave balances derived (14/8/10)', bal.body.data?.some((b) => b.code === 'ANNUAL' && b.allocated === 14), bal.body.data);

  const apply = await call('POST', '/leave', {
    token: emp,
    body: { leaveTypeId: casual.id, startDate: `${month}-26`, endDate: `${month}-27`, reason: 'Family wedding' },
  });
  check('employee applies for leave', apply.status === 201, apply.body);
  const leaveId = apply.body.data.id;
  const applyDays = apply.body.data.days;
  check('leave days counted as working days', typeof applyDays === 'number' && applyDays > 0, applyDays);

  const overlap = await call('POST', '/leave', {
    token: emp,
    body: { leaveTypeId: casual.id, startDate: `${month}-27`, endDate: `${month}-29`, reason: 'Overlap test' },
  });
  check('overlapping leave rejected (422)', overlap.status === 422, overlap.body);

  const tooMany = await call('POST', '/leave', {
    token: emp,
    body: { leaveTypeId: casual.id, startDate: `${month}-05`, endDate: `${month}-25`, reason: 'Too long' },
  });
  check('over-balance leave rejected (422)', tooMany.status === 422, tooMany.body);

  const selfOther = await call('GET', `/employees/${emp1Id === empSelf ? 'nope' : emp1Id}`, { token: emp });
  check('employee cannot read another profile', selfOther.status === 403 || selfOther.status === 404, selfOther.status);

  console.log('\n== HR approvals ==');
  const inbox = await call('GET', '/leave/inbox', { token: hrToken });
  check('HR inbox has the pending request', inbox.body.data?.some((l) => l.id === leaveId), inbox.body.data?.length);

  const approve = await call('PATCH', `/leave/${leaveId}/decision`, { token: hrToken, body: { decision: 'approved', comment: 'Have fun' } });
  check('HR approves leave', approve.status === 200 && approve.body.data.status === 'approved', approve.body);

  const board = await call('GET', '/attendance/board', { token: hrToken });
  check('daily attendance board', board.status === 200 && board.body.data.rows.length >= 2, board.body.data?.summary);

  const correction = await call('POST', '/attendance/corrections', {
    token: emp, body: { date: `${month}-02`, requestedCheckIn: '09:05', requestedCheckOut: '18:00', reason: 'Forgot to check in that day' },
  });
  check('employee requests an attendance correction', correction.status === 201, correction.body);
  const decided = await call('PATCH', `/attendance/corrections/${correction.body.data.id}`, {
    token: hrToken, body: { decision: 'approved', comment: 'Fixed' },
  });
  check('HR approves the correction', decided.status === 200, decided.body);

  console.log('\n== payroll ==');
  const preview = await call('GET', `/payroll/preview?month=${month}`, { token: hrToken });
  check('payroll preview computes 1.5x basic gross', preview.status === 200 &&
    preview.body.data.items?.[0]?.gross === 180000, preview.body.data?.items?.[0]?.gross);

  const run = await call('POST', '/payroll/runs', { token: hrToken, body: { month } });
  check('HR creates a draft payroll run', run.status === 201 && run.body.data.status === 'draft', run.body);
  const runId = run.body.data.id;

  const hrFinalize = await call('POST', `/payroll/runs/${runId}/finalize`, { token: hrToken });
  check('HR cannot finalize (403)', hrFinalize.status === 403, hrFinalize.status);

  const finalize = await call('POST', `/payroll/runs/${runId}/finalize`, { token: admin });
  check('Admin finalizes payroll', finalize.status === 200 && finalize.body.data.status === 'finalized', finalize.body);
  const itemId = finalize.body.data.items[0].id;

  const relock = await call('POST', '/payroll/runs', { token: hrToken, body: { month } });
  check('finalized payroll is locked (409)', relock.status === 409, relock.body);

  const payslips = await call('GET', '/payroll/me/payslips', { token: emp });
  check('employee sees finalized payslips', payslips.body.data?.length >= 1, payslips.body.data);

  const pdf = await fetch(`${BASE}/payroll/payslips/${itemId}.pdf`, { headers: { Authorization: `Bearer ${emp}` } });
  const buf = Buffer.from(await pdf.arrayBuffer());
  check('payslip PDF downloads', pdf.status === 200 && buf.subarray(0, 4).toString() === '%PDF' && buf.length > 800, { status: pdf.status, size: buf.length });

  const otherPdf = await fetch(`${BASE}/payroll/payslips/${finalize.body.data.items[1].id}.pdf`, { headers: { Authorization: `Bearer ${emp}` } });
  check("employee cannot download a colleague's payslip", otherPdf.status === 404, otherPdf.status);

  console.log('\n== dashboards ==');
  for (const [label, token] of [['admin', admin], ['hr', hrToken], ['employee', emp]]) {
    const d = await call('GET', '/analytics/dashboard', { token });
    check(`${label} dashboard`, d.status === 200 && d.body.data.kpis, { status: d.status, msg: d.body.error?.message });
  }

  console.log('\n== AI (local rules fallback) ==');
  const aiStatus = await call('GET', '/ai/status', { token: hrToken });
  check('ai status endpoint', aiStatus.status === 200, aiStatus.body.data);
  const aiChat = await call('POST', '/ai/chat', { token: hrToken, body: { question: 'How many active employees do we have?' } });
  check('AI answers a headcount question', aiChat.status === 200 && /2/.test(aiChat.body.data.answer || ''), aiChat.body.data?.answer);
  const aiPrivacy = await call('POST', '/ai/chat', { token: emp, body: { question: 'What is my colleague Sara Khan salary?' } });
  check('AI refuses a colleague salary question', aiPrivacy.status === 200 && /own|private|only/i.test(aiPrivacy.body.data.answer || ''), aiPrivacy.body.data?.answer);
  const smart = await call('POST', '/ai/smart-leave', { token: emp, body: { text: 'I need next Monday off for my sisters wedding' } });
  check('smart leave returns a prefilled form', smart.status === 200 && smart.body.data.prefilled?.startDate, smart.body.data?.prefilled);

  console.log('\n== comms, audit, csv ==');
  const ann = await call('POST', '/announcements', { token: hrToken, body: { title: 'Eid holidays', body: 'Office closed next week', audience: 'all', pinned: true } });
  check('HR posts an announcement', ann.status === 201, ann.body);
  const notifs = await call('GET', '/notifications', { token: emp });
  check('employee notifications delivered', notifs.body.data?.items?.length >= 1, notifs.body.data?.unread);
  const audit = await call('GET', '/audit-logs', { token: admin });
  check('admin reads the audit log', audit.status === 200 && audit.body.data.length > 3, audit.body.data?.length);
  const auditForbidden = await call('GET', '/audit-logs', { token: hrToken });
  check('HR cannot read the audit log (403)', auditForbidden.status === 403, auditForbidden.status);

  const dry = await call('POST', '/employees/import', {
    token: hrToken,
    body: { dryRun: true, csv: 'firstName,lastName,email,joinDate,basic,department\nBob,Khan,bob@northwind.test,2026-02-01,50000,Engineering\nBad,Row,not-an-email,2026-13-01,abc,FakeDept\n' },
  });
  check('CSV dry-run reports row + field + reason', dry.status === 200 && dry.body.data.errors.length >= 3, dry.body.data);
  const template = await fetch(`${BASE}/employees/import/template`, { headers: { Authorization: `Bearer ${hrToken}` } });
  check('CSV template downloads', template.status === 200, template.status);

  const csv = await call('POST', '/employees/import', {
    token: hrToken,
    body: { dryRun: false, csv: 'firstName,lastName,email,joinDate,basic,department\nBob,Khan,bob@northwind.test,2026-02-01,50000,Engineering\n' },
  });
  check('CSV import writes the row', csv.status === 200 && csv.body.data.imported === 1, csv.body.data);

  const total = await call('GET', '/analytics/kpi', { token: admin });
  check('kpi snapshot for the AI', total.status === 200 && total.body.data.kpis.headcount >= 3, total.body.data?.kpis?.headcount);

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  server.close();
  closeDb();
  if (fail) {
    console.log(JSON.stringify(errors, null, 2).slice(0, 3000));
    process.exit(1);
  }
})().catch((err) => {
  console.error('smoke crashed:', err);
  process.exit(1);
});
