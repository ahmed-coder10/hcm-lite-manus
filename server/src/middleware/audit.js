import { run, nowIso } from '../db/index.js';

/**
 * Writes one audit row. Never throws into the request path: an audit failure
 * must not roll back a successful business action.
 */
export async function recordAudit(req, { action, entity, entityId, summary, before, after }) {
  try {
    run(
      `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity, entity_id, summary,
         before_json, after_json, ip, user_agent, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(),
      req.user ? req.user.id : null,
      req.user ? req.user.name : 'system',
      req.user ? req.user.role : 'system',
      action,
      entity,
      entityId ? String(entityId) : '',
      summary || '',
      before ? JSON.stringify(sanitize(before)) : null,
      after ? JSON.stringify(sanitize(after)) : null,
      req.ip || '',
      req.headers?.['user-agent']?.slice(0, 300) || '',
      nowIso(),
    );
  } catch (err) {
    console.error('[audit] failed to write log:', err.message);
  }
}

function sanitize(obj) {
  const plain = { ...obj };
  delete plain.passwordHash;
  delete plain.password_hash;
  delete plain.__v;
  return plain;
}
