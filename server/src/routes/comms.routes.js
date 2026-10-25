import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, nowIso } from '../db/index.js';
import { asyncHandler, ok, created, assertSchema, notFound, forbidden } from '../utils/http.js';
import { authorize } from '../middleware/auth.js';
import { recordAudit } from '../middleware/audit.js';
import { listNotifications, markRead, markAllRead, unreadCount, notifyUser } from '../services/notify.service.js';

const router = Router();

/* ------------------------------- announcements ------------------------------ */

router.get('/announcements', (req, res) => {
  const rows = all('SELECT * FROM announcements ORDER BY pinned DESC, published_at DESC LIMIT 50').map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    audience: a.audience,
    authorName: a.author_name,
    authorRole: a.author_role,
    pinned: a.pinned === 1,
    publishedAt: a.published_at,
  }));
  const visible = req.auth.role === 'employee'
    ? rows.filter((a) => a.audience === 'all' || a.audience === 'employee')
    : rows;
  ok(res, visible);
});

router.post(
  '/announcements',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const body = assertSchema(
      z.object({
        title: z.string().min(3, 'Add a title'),
        body: z.string().min(5, 'Add a message'),
        audience: z.enum(['all', 'hr', 'employee']).default('all'),
        pinned: z.boolean().optional(),
      }),
      req.body,
    );
    const id = crypto.randomUUID();
    run(
      `INSERT INTO announcements (id, title, body, audience, author_id, author_name, author_role, pinned,
         published_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, body.title, body.body, body.audience, req.auth.userId, req.user.name, req.auth.role,
      body.pinned ? 1 : 0, nowIso(), nowIso(), nowIso(),
    );
    const targets = body.audience === 'all'
      ? all('SELECT id FROM users WHERE is_active = 1')
      : body.audience === 'hr'
        ? all("SELECT id FROM users WHERE is_active = 1 AND role IN ('hr','admin')")
        : all("SELECT id FROM users WHERE is_active = 1 AND role = 'employee'");
    for (const t of targets) {
      notifyUser(t.id, {
        title: 'New announcement',
        body: body.title,
        type: 'announcement',
        link: '/app/announcements',
      });
    }
    await recordAudit(req, { action: 'announcement.create', entity: 'announcement', entityId: id, summary: body.title });
    created(res, { id, ...body });
  }),
);

router.delete(
  '/announcements/:id',
  authorize('admin', 'hr'),
  asyncHandler(async (req, res) => {
    const row = get('SELECT * FROM announcements WHERE id = ?', req.params.id);
    if (!row) throw notFound('Announcement not found.');
    if (req.auth.role === 'hr' && row.author_id !== req.auth.userId) {
      throw forbidden('HR can only delete their own announcements.');
    }
    run('DELETE FROM announcements WHERE id = ?', req.params.id);
    await recordAudit(req, { action: 'announcement.delete', entity: 'announcement', entityId: req.params.id, summary: row.title });
    res.json({ data: { message: 'Announcement deleted.' } });
  }),
);

/* ------------------------------- notifications ------------------------------ */

router.get('/notifications', (req, res) =>
  ok(res, { items: listNotifications(req.auth.userId, { limit: req.query.limit }), unread: unreadCount(req.auth.userId) }),
);

router.patch('/notifications/read-all', (req, res) => {
  markAllRead(req.auth.userId);
  ok(res, { unread: 0 });
});

router.patch('/notifications/:id/read', (req, res) => {
  markRead(req.auth.userId, req.params.id);
  ok(res, { unread: unreadCount(req.auth.userId) });
});

/* --------------------------------- audit ---------------------------------- */

router.get(
  '/audit-logs',
  authorize('admin'),
  (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 80);
    const rows = all(
      `SELECT * FROM audit_logs ${req.query.action ? 'WHERE action LIKE ?' : ''} ORDER BY created_at DESC LIMIT ?`,
      ...(req.query.action ? [`%${req.query.action}%`] : []), limit,
    ).map((a) => ({
      id: a.id,
      actorName: a.actor_name,
      actorRole: a.actor_role,
      action: a.action,
      entity: a.entity,
      entityId: a.entity_id,
      summary: a.summary,
      before: a.before_json ? JSON.parse(a.before_json) : null,
      after: a.after_json ? JSON.parse(a.after_json) : null,
      ip: a.ip,
      createdAt: a.created_at,
    }));
    ok(res, rows);
  },
);

export default router;
