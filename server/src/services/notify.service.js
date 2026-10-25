import { all, get, run, nowIso } from '../db/index.js';

export function notifyUser(userId, { title, body = '', type = 'info', link = '', meta = {} }) {
  if (!userId) return null;
  const id = crypto.randomUUID();
  run(
    'INSERT INTO notifications (id, user_id, title, body, type, link, meta, created_at) VALUES (?,?,?,?,?,?,?,?)',
    id, userId, title, body, type, link, JSON.stringify(meta || {}), nowIso(),
  );
  return id;
}

/** Notify the login that belongs to an employee (no-op when they have none). */
export function notifyEmployee(employeeId, payload) {
  const user = get('SELECT id FROM users WHERE employee_id = ? AND is_active = 1', employeeId);
  return user ? notifyUser(user.id, payload) : null;
}

export function notifyRole(role, payload) {
  for (const u of all('SELECT id FROM users WHERE role = ? AND is_active = 1', role)) {
    notifyUser(u.id, payload);
  }
}

export const listNotifications = (userId, { unreadOnly = false, limit = 30 } = {}) =>
  all(
    `SELECT * FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND read = 0' : ''}
     ORDER BY created_at DESC LIMIT ?`,
    userId, Math.min(100, Number(limit) || 30),
  ).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    type: n.type,
    link: n.link,
    read: n.read === 1,
    meta: JSON.parse(n.meta || '{}'),
    createdAt: n.created_at,
  }));

export function markRead(userId, id) {
  run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', id, userId);
}

export function markAllRead(userId) {
  run('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', userId);
}

export const unreadCount = (userId) =>
  get('SELECT count(*) AS c FROM notifications WHERE user_id = ? AND read = 0', userId).c;
