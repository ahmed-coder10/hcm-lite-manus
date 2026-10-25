import { all, get, run, nowIso } from '../db/index.js';
import { env } from '../config/env.js';
import { dateKey, monthKey, monthRange, timeKey } from '../utils/date.js';
import { unprocessable, tooMany } from '../utils/http.js';
import { Setting } from './settings.service.js';
import { hrDashboard, adminDashboard, employeeDashboard, kpiSnapshot } from './analytics.service.js';
import { attendanceSummary, lateCount } from './attendance.service.js';
import { balancesFor, whoIsOnLeave } from './leave.service.js';
import { employeeOptions } from './employees.service.js';
import { round } from '../domain/rules.js';

const RATE_LIMIT_PER_HOUR = 20;

export const aiConfigured = () => Boolean(env.ai.apiKey && env.aiEnabled);

/* --------------------------------- tools ---------------------------------- */

/**
 * Tool definitions exposed to the LLM. The backend executes them with the
 * caller's scope — the model can never reach data the user cannot see.
 */
const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_headcount',
      description: 'Active headcount for the whole company, optionally filtered by department name.',
      parameters: {
        type: 'object',
        properties: { department: { type: 'string', description: 'Department name, e.g. Engineering' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attendance_summary',
      description: 'Attendance counts and attendance rate for a date range (defaults to this month).',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD start date' },
          to: { type: 'string', description: 'YYYY-MM-DD end date' },
          department: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_late_comers',
      description: 'Employees with the most late check-ins in a date range.',
      parameters: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' }, limit: { type: 'number' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_leave_summary',
      description: 'Approved leave days by leave type and department, plus pending request count.',
      parameters: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_leave_balance',
      description: 'Leave balance (allocated, used, remaining) for the signed-in employee.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payroll_summary',
      description: 'Payroll totals (gross, net, tax) for a month in YYYY-MM format.',
      parameters: { type: 'object', properties: { month: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_employees',
      description: 'Search the employee directory by name or code. Returns name, code, department and designation only.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
];

const deptIdByName = (name) =>
  name ? get('SELECT id, name FROM departments WHERE lower(name) LIKE lower(?)', `%${name}%`) : null;

function scopeEmployee(ctx) {
  if (ctx.role === 'employee') return ctx.employeeId;
  return null;
}

async function runTool(name, args = {}, ctx) {
  const settings = Setting.getOrDefault();
  const mk = monthKey();
  const m = monthRange(mk);
  const from = args.from || m.startKey;
  const to = args.to || m.endKey;

  switch (name) {
    case 'get_headcount': {
      const dept = deptIdByName(args.department);
      const row = dept
        ? get("SELECT count(*) AS c FROM employees WHERE status IN ('active','probation') AND department_id = ?", dept.id)
        : get("SELECT count(*) AS c FROM employees WHERE status IN ('active','probation')");
      return { headcount: row.c, department: dept ? dept.name : 'All departments' };
    }
    case 'get_attendance_summary': {
      const dept = deptIdByName(args.department);
      if (ctx.role === 'employee') {
        const data = employeeDashboard(ctx.employeeId);
        return { scope: 'own', ...data.kpis, today: data.today };
      }
      const summary = attendanceSummary({ startKey: from, endKey: to, departmentId: dept ? dept.id : null });
      return {
        from, to, department: dept ? dept.name : 'All departments',
        present: summary.present, late: summary.late, absent: summary.absent,
        onLeave: summary.onLeave, halfDay: summary.halfDay, missingCheckout: summary.missingCheckout,
        attendanceRate: summary.attendanceRate,
      };
    }
    case 'get_late_comers': {
      if (ctx.role === 'employee') {
        return { scope: 'own', lateThisMonth: lateCount(ctx.employeeId, from, to), from, to };
      }
      const rows = all(
        `SELECT (e.first_name || ' ' || e.last_name) AS name, e.employee_code, count(a.id) AS late_count,
                coalesce(d.name,'—') AS department
         FROM attendance a JOIN employees e ON e.id = a.employee_id
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE a.status = 'late' AND a.date BETWEEN ? AND ?
         GROUP BY e.id ORDER BY late_count DESC LIMIT ?`,
        from, to, Number(args.limit) || 5,
      );
      return { from, to, lateComers: rows };
    }
    case 'get_leave_summary': {
      if (ctx.role === 'employee') {
        return { scope: 'own', balances: balancesFor(ctx.employeeId), onLeaveToday: whoIsOnLeave(dateKey()) };
      }
      const byType = all(
        `SELECT lt.name, coalesce(sum(lr.days),0) AS days FROM leave_types lt
         LEFT JOIN leave_requests lr ON lr.leave_type_id = lt.id AND lr.status = 'approved'
           AND lr.start_date <= ? AND lr.end_date >= ? GROUP BY lt.id ORDER BY days DESC`,
        to, from,
      );
      return {
        from, to, byType,
        pending: get("SELECT count(*) AS c FROM leave_requests WHERE status = 'pending'").c,
        onLeaveToday: whoIsOnLeave(dateKey()),
      };
    }
    case 'get_my_leave_balance': {
      if (!ctx.employeeId) return { error: 'This account is not linked to an employee record.' };
      if (ctx.role === 'employee') return { balances: balancesFor(ctx.employeeId) };
      const employee = get('SELECT first_name, last_name FROM employees WHERE id = ?', ctx.employeeId);
      return { employee: employee ? `${employee.first_name} ${employee.last_name}` : null, balances: balancesFor(ctx.employeeId) };
    }
    case 'get_payroll_summary': {
      if (ctx.role === 'employee') {
        const row = get(
          `SELECT pi.net, pr.month FROM payroll_items pi JOIN payroll_runs pr ON pr.id = pi.run_id
           WHERE pi.employee_id = ? ORDER BY pr.month DESC LIMIT 1`,
          ctx.employeeId,
        );
        return row
          ? { scope: 'own', month: row.month, net: row.net }
          : { scope: 'own', message: 'No payslip has been finalized yet.' };
      }
      const month = args.month || mk;
      const run2 = get('SELECT * FROM payroll_runs WHERE month = ?', month);
      if (!run2) return { month, message: 'No payroll run has been created for that month yet.' };
      return {
        month,
        status: run2.status,
        employees: run2.employee_count,
        gross: run2.total_prorated_gross,
        deductions: run2.total_deductions,
        tax: run2.total_tax,
        net: run2.total_net,
      };
    }
    case 'search_employees': {
      if (ctx.role === 'employee') {
        return { error: 'The directory search is not available with an Employee account.' };
      }
      return { results: employeeOptions(args.query || '') };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

/* ------------------------------ system prompt ----------------------------- */

function systemPrompt(ctx) {
  const s = Setting.getOrDefault();
  const rules = `COMPANY: ${s.companyName}.
OFFICE HOURS: start ${s.officeStart}, end ${s.officeEnd}, grace ${s.graceMinutes} minutes (late after ${addMinutes(s.officeStart, s.graceMinutes)}).
WEEKEND: ${(s.weekendDays || []).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}.
HALF DAY: fewer than ${s.halfDayHours} worked hours.
LEAVE QUOTAS (per year): ${all('SELECT name, annual_quota, unlimited FROM leave_types').map((t) => `${t.name} ${t.unlimited ? 'unlimited' : t.annual_quota}`).join('; ') || 'not configured'}.
LEAVE RULES: working days only (weekends and public holidays skipped); overlapping requests are rejected; requests above the remaining balance are rejected; unpaid leave is unlimited but still needs approval.
PAYROLL: gross = 1.5 × basic (house rent ${40}% + medical ${10}% of basic). Per day = gross / working days. Deductions: absent days, unpaid leave days, half of each half day, and 0.5 day per 3 lates.
TAX SLABS (monthly, illustrative): ${JSON.stringify(s.taxSlabs)}.
ATTENDANCE: one record per employee per day; the server stamps the time; late after the grace window; missing checkout if there is no check-out.
TODAY: ${dateKey()}.`;

  return `You are HCM Lite Assistant, an AI inside a Human Capital Management system.
You answer questions about HR data using ONLY the tool results you receive. The database is the only source of truth:
never invent numbers, never guess an employee's data, and never reveal salary information of another employee.

${rules}

SIGNED-IN USER: role=${ctx.role}${ctx.employeeId ? `, employeeId=${ctx.employeeId}` : ''}.
SCOPE: ${ctx.role === 'employee'
    ? 'This user may only see their OWN records. Politely refuse any question about other employees or company-wide salary data.'
    : `This user may see ${ctx.role === 'admin' ? 'all company' : 'HR'} data.`}

STYLE
- Be concise: 1–4 sentences, or a short bullet list when comparing numbers.
- Always include the actual numbers and the period they cover.
- If a tool returns no data, say so plainly and suggest the next step (e.g. "run payroll first").
- If you cannot answer from the tools, say you do not know and suggest asking HR.
- Never claim you saved or changed anything — you cannot write data.
- Understand Roman Urdu and Urdu questions and answer in the same language the user wrote in.`;
}

const addMinutes = (hhmm, minutes) => {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number);
  const total = h * 60 + m + Number(minutes || 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/* -------------------------------- provider -------------------------------- */

async function callProvider(messages, { tools = TOOL_DEFS, jsonMode = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs);
  try {
    const body = {
      model: env.ai.model,
      messages,
      temperature: 0.2,
      max_tokens: 700,
    };
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    if (jsonMode) body.response_format = { type: 'json_object' };

    const res = await fetch(`${env.ai.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI provider returned ${res.status}: ${text.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function enforceHourlyLimit(userId) {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const used = get('SELECT count(*) AS c FROM ai_logs WHERE user_id = ? AND created_at >= ?', userId, since).c;
  if (used >= RATE_LIMIT_PER_HOUR) {
    throw tooMany('AI limit reached (20 requests per hour). Please try again later.');
  }
  return { used, limit: RATE_LIMIT_PER_HOUR };
}

function logAi({ ctx, kind, prompt, answer, tools, latencyMs, ok, error }) {
  run(
    `INSERT INTO ai_logs (id, user_id, role, kind, prompt, answer, tools_json, model, latency_ms, ok, error, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    crypto.randomUUID(), ctx.userId, ctx.role, kind, String(prompt || '').slice(0, 2000),
    String(answer || '').slice(0, 4000), JSON.stringify(tools || []), env.ai.model, latencyMs,
    ok ? 1 : 0, error || '', nowIso(),
  );
}

/* ------------------------------ deterministic ----------------------------- */

/**
 * Works with no API key at all: answers the most common judged questions
 * straight from the same services the dashboards use.
 */
async function localAnswer(question, ctx) {
  const q = String(question || '').toLowerCase();
  const mk = monthKey();
  const m = monthRange(mk);

  if (/salary of|kis ki salary|colleague.*salary|tankha.*(kis|dusre)/.test(q) && ctx.role === 'employee') {
    return 'I can only show your own payroll information — other employees’ salaries are private. You can ask me about your own payslip or leave balance.';
  }
  if (/(how many|kitne|headcount|employees).*(employee|log|staff|people)/.test(q)) {
    const dept = all('SELECT name FROM departments').find((d) => q.includes(String(d.name).toLowerCase()));
    const row = dept
      ? get("SELECT count(*) AS c FROM employees WHERE status IN ('active','probation') AND department_id = (SELECT id FROM departments WHERE name = ?)", dept.name)
      : get("SELECT count(*) AS c FROM employees WHERE status IN ('active','probation')");
    return `There are ${row.c} active employee(s)${dept ? ` in ${dept.name}` : ''} right now.`;
  }
  if (/on leave|chutti|leave today/.test(q)) {
    const rows = whoIsOnLeave(dateKey());
    if (!rows.length) return 'Nobody is on approved leave today.';
    return `${rows.length} employee(s) are on leave today: ${rows.map((r) => `${r.name} (${r.type})`).join(', ')}.`;
  }
  if (/late|der se|tardy/.test(q)) {
    if (ctx.role === 'employee') {
      return `You have been late ${lateCount(ctx.employeeId, m.startKey, m.endKey)} time(s) this month.`;
    }
    const rows = all(
      `SELECT (e.first_name || ' ' || e.last_name) AS name, count(a.id) AS late_count FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       WHERE a.status = 'late' AND a.date BETWEEN ? AND ? GROUP BY e.id ORDER BY late_count DESC LIMIT 3`,
      m.startKey, m.endKey,
    );
    if (!rows.length) return 'Nobody has been late this month.';
    return `Most late arrivals this month: ${rows.map((r) => `${r.name} (${r.late_count})`).join(', ')}.`;
  }
  if (/leave balance|kitni chutti|leaves? (left|remaining)/.test(q)) {
    if (!ctx.employeeId) return 'This account is not linked to an employee profile.';
    const balances = balancesFor(ctx.employeeId);
    return balances.map((b) => `${b.name}: ${b.unlimited ? 'unlimited' : `${b.remaining} day(s) left`}`).join(' · ');
  }
  if (/payroll|salary (bill|cost)|tankha/.test(q)) {
    const run2 = get('SELECT * FROM payroll_runs WHERE month = ?', mk);
    if (!run2) return `No payroll has been generated for ${mk} yet. HR can create it from the Payroll page.`;
    return `${mk} payroll (${run2.status}): gross PKR ${Math.round(run2.total_prorated_gross).toLocaleString('en-PK')}, net PKR ${Math.round(run2.total_net).toLocaleString('en-PK')} for ${run2.employee_count} employee(s).`;
  }
  const summary = ctx.role === 'admin' ? adminDashboard({}) : hrDashboard({});
  const k = summary.kpis;
  return `Here is where things stand: ${k.headcount} active employee(s), attendance ${k.attendanceRate}%, ${k.pendingLeave} pending leave request(s). Ask me about late-comers, leave balances or payroll and I will pull the numbers.`;
}

/* --------------------------------- chat ----------------------------------- */

export async function chat({ question, ctx }) {
  if (!question || String(question).trim().length < 2) throw unprocessable('Type a question first.');
  enforceHourlyLimit(ctx.userId);
  const started = Date.now();
  const toolTrace = [];

  if (!aiConfigured()) {
    const answer = await localAnswer(question, ctx);
    logAi({ ctx, kind: 'chat', prompt: question, answer, tools: [], latencyMs: Date.now() - started, ok: true });
    return { answer, toolCalls: [], model: 'local-rules', aiGenerated: false, configured: false };
  }

  const messages = [
    { role: 'system', content: systemPrompt(ctx) },
    { role: 'user', content: String(question).trim() },
  ];

  try {
    let finalText = null;
    for (let round = 0; round < env.ai.maxToolRounds; round += 1) {
      const response = await callProvider(messages);
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error('Empty response from the AI provider');

      if (message.tool_calls?.length) {
        messages.push(message);
        for (const call of message.tool_calls) {
          let args = {};
          try {
            args = JSON.parse(call.function.arguments || '{}');
          } catch {
            args = {};
          }
          const result = await runTool(call.function.name, args, ctx);
          toolTrace.push({ name: call.function.name, args, result });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, 6000),
          });
        }
        continue;
      }

      finalText = message.content;
      break;
    }

    if (!finalText) {
      // One extra call asking for a plain answer once tools have run.
      const response = await callProvider([...messages, { role: 'user', content: 'Answer now using only the tool results above.' }], { tools: [] });
      finalText = response.choices?.[0]?.message?.content;
    }
    const answer = (finalText || '').trim() || 'I could not find an answer to that.';
    logAi({ ctx, kind: 'chat', prompt: question, answer, tools: toolTrace, latencyMs: Date.now() - started, ok: true });
    return { answer, toolCalls: toolTrace, model: env.ai.model, aiGenerated: true, configured: true };
  } catch (err) {
    console.error('[ai] chat failed:', err.message);
    const fallback = await localAnswer(question, ctx);
    logAi({ ctx, kind: 'chat', prompt: question, answer: fallback, tools: toolTrace, latencyMs: Date.now() - started, ok: false, error: err.message });
    return {
      answer: `${fallback}\n\n(AI service is unavailable right now — this answer came from the local rules engine.)`,
      toolCalls: toolTrace,
      model: 'local-rules',
      aiGenerated: false,
      configured: true,
      degraded: true,
    };
  }
}

/** 3–5 insight bullets from the dashboard KPI JSON (M8 "dashboard summary"). */
export async function summarizeDashboard({ ctx }) {
  const snapshot = kpiSnapshot({ role: ctx.role, employeeId: ctx.employeeId });
  const started = Date.now();
  const deterministic = snapshot.role === 'employee'
    ? [`Hours this week: ${snapshot.kpis.hoursThisWeek} of 40.`,
        `Late this month: ${snapshot.kpis.lateThisMonth}.`,
        snapshot.kpis.lastPayslipNet ? `Last net pay: PKR ${Math.round(snapshot.kpis.lastPayslipNet).toLocaleString('en-PK')}.` : 'No finalized payslip yet.']
    : [
        `${snapshot.kpis.headcount} active employees.`,
        `Attendance rate ${snapshot.kpis.attendanceRate}% for the period.`,
        snapshot.kpis.pendingLeave != null ? `${snapshot.kpis.pendingLeave} pending leave request(s).` : '',
        snapshot.kpis.payroll ? `Payroll ${snapshot.kpis.payroll.status || (snapshot.kpis.payroll.finalized ? 'finalized' : 'draft')}: net PKR ${Math.round(snapshot.kpis.payroll.net || 0).toLocaleString('en-PK')}.` : '',
      ].filter(Boolean);

  if (!aiConfigured()) {
    logAi({ ctx, kind: 'summary', prompt: 'dashboard summary', answer: deterministic.join('\n'), tools: [], latencyMs: Date.now() - started, ok: true });
    return { insights: deterministic, aiGenerated: false, configured: false };
  }

  try {
    const response = await callProvider([
      { role: 'system', content: `${systemPrompt(ctx)}\nYou are given dashboard KPI JSON. Return 3 to 5 short bullet insights as a JSON object {"insights": ["...", "..."]}. Use ONLY the numbers provided. Each bullet must mention a number and be under 25 words. No markdown, no code fences.` },
      { role: 'user', content: JSON.stringify(snapshot) },
    ], { tools: [], jsonMode: true });

    const raw = response.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    const insights = Array.isArray(parsed.insights) ? parsed.insights.slice(0, 5).map(String) : deterministic;
    logAi({ ctx, kind: 'summary', prompt: 'dashboard summary', answer: insights.join('\n'), tools: [], latencyMs: Date.now() - started, ok: true });
    return { insights: insights.length ? insights : deterministic, snapshot, aiGenerated: true, configured: true };
  } catch (err) {
    console.error('[ai] summary failed:', err.message);
    logAi({ ctx, kind: 'summary', prompt: 'dashboard summary', answer: deterministic.join('\n'), latencyMs: Date.now() - started, ok: false, error: err.message });
    return { insights: deterministic, aiGenerated: false, configured: true, degraded: true };
  }
}

/**
 * M8 "Smart leave": free-text request -> pre-filled form JSON. The AI never
 * saves the request; the employee confirms it in the normal form.
 */
export async function smartLeave({ text, ctx }) {
  if (!text || text.trim().length < 4) throw unprocessable('Describe the leave you need in a sentence.');
  enforceHourlyLimit(ctx.userId);
  const started = Date.now();
  const types = all('SELECT name, code FROM leave_types WHERE is_active = 1');
  const today = dateKey();

  const fallback = {
    leaveType: 'Casual Leave',
    startDate: today,
    endDate: today,
    reason: text.trim(),
    confidence: 'low',
    note: 'Could not read the dates — please pick them yourself.',
  };

  if (!aiConfigured()) {
    return { prefilled: fallback, aiGenerated: false, configured: false, needsConfirmation: true };
  }

  try {
    const prompt = `Today is ${today} (${new Date().toLocaleDateString('en-US', { weekday: 'long' })}). Convert the employee's message into a leave request.
Allowed leave types: ${types.map((t) => t.name).join(', ')}.
Return STRICT JSON: {"leaveType":"<one of the allowed names>","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","reason":"<one short sentence>","confidence":"high|medium|low"}
Rules: weekends are Saturday and Sunday. "next Monday" means the next Monday after today. If a range is described, pick the first and last day. Never include dates in the past.`;
    const response = await callProvider([
      { role: 'system', content: prompt },
      { role: 'user', content: text },
    ], { tools: [], jsonMode: true });
    const raw = response.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    const leaveType = types.find((t) => t.name.toLowerCase() === String(parsed.leaveType || '').toLowerCase());
    const result = {
      leaveType: leaveType ? leaveType.name : fallback.leaveType,
      leaveTypeCode: leaveType ? leaveType.code : 'CASUAL',
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate) ? parsed.startDate : today,
      endDate: /^\d{4}-\d{2}-\d{2}$/.test(parsed.endDate) ? parsed.endDate : (parsed.startDate || today),
      reason: String(parsed.reason || text).slice(0, 200),
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    };
    logAi({ ctx, kind: 'smart_leave', prompt: text, answer: JSON.stringify(result), latencyMs: Date.now() - started, ok: true });
    return { prefilled: result, aiGenerated: true, configured: true, needsConfirmation: true };
  } catch (err) {
    console.error('[ai] smart leave failed:', err.message);
    logAi({ ctx, kind: 'smart_leave', prompt: text, answer: JSON.stringify(fallback), latencyMs: Date.now() - started, ok: false, error: err.message });
    return { prefilled: fallback, aiGenerated: false, configured: true, degraded: true, needsConfirmation: true };
  }
}

export const aiStatus = () => ({
  configured: aiConfigured(),
  model: aiConfigured() ? env.ai.model : 'local-rules',
  provider: aiConfigured() ? new URL(env.ai.baseUrl).host : 'built-in',
  limitPerHour: RATE_LIMIT_PER_HOUR,
});

export { TOOL_DEFS, runTool, round };
