import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, assertSchema } from '../utils/http.js';
import { authorize } from '../middleware/auth.js';
import { chat, summarizeDashboard, smartLeave, aiStatus } from '../services/ai.service.js';
import { all } from '../db/index.js';

const router = Router();

router.get('/status', (_req, res) => ok(res, aiStatus()));

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({ question: z.string().min(2, 'Type a question first') }),
      req.body,
    );
    const result = await chat({ question: body.question, ctx: req.auth });
    ok(res, result);
  }),
);

router.post(
  '/summary',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const result = await summarizeDashboard({ ctx: req.auth });
    ok(res, result);
  }),
);

router.post(
  '/smart-leave',
  asyncHandler(async (req, res) => {
    const body = assertSchema(z.object({ text: z.string().min(4, 'Describe the leave in a sentence') }), req.body);
    const result = await smartLeave({ text: body.text, ctx: req.auth });
    ok(res, result);
  }),
);

router.get('/logs', authorize('admin'), (_req, res) =>
  ok(
    res,
    all(
      `SELECT al.*, u.name AS user_name FROM ai_logs al LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC LIMIT 60`,
    ).map((r) => ({
      id: r.id,
      userName: r.user_name || 'system',
      role: r.role,
      kind: r.kind,
      prompt: r.prompt,
      answer: r.answer,
      model: r.model,
      latencyMs: r.latency_ms,
      ok: r.ok === 1,
      createdAt: r.created_at,
    })),
  ),
);

export default router;
