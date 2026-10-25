import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema.js';

let dbInstance = null;
const statementCache = new Map();

/** Opens (and migrates) the SQLite file. Returns the connection. */
export function initDb(file = process.env.DB_FILE || './data/hcm.db') {
  const abs = file === ':memory:' ? ':memory:' : path.resolve(file);
  if (abs !== ':memory:') fs.mkdirSync(path.dirname(abs), { recursive: true });
  dbInstance = new DatabaseSync(abs);
  dbInstance.exec(SCHEMA_SQL);
  const row = get("SELECT value FROM meta WHERE key = 'schema_version'");
  if (!row) run("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) dbInstance.close();
  dbInstance = null;
  statementCache.clear();
}

function prepare(sql) {
  let stmt = statementCache.get(sql);
  if (!stmt) {
    stmt = dbInstance.prepare(sql);
    statementCache.set(sql, stmt);
  }
  return stmt;
}

const bind = (params) => params.map((p) => (p === undefined ? null : p));

/** Rows as plain objects. */
export function all(sql, ...params) {
  return prepare(sql).all(...bind(params));
}

export function get(sql, ...params) {
  return prepare(sql).get(...bind(params));
}

export function run(sql, ...params) {
  return prepare(sql).run(...bind(params));
}

export function scalar(sql, ...params) {
  const row = get(sql, ...params);
  if (!row) return null;
  return Object.values(row)[0];
}

/** Runs fn inside a write transaction; rolls back on any throw. */
export function tx(fn) {
  dbInstance.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    dbInstance.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      dbInstance.exec('ROLLBACK');
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();

export const bool = (v) => v === 1 || v === true || v === '1';
export const bit = (v) => (v ? 1 : 0);

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Basic pagination helper shared by every list endpoint. */
export function paginate(query, { page = 1, limit = 20 } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  return { page: p, limit: l, offset: (p - 1) * l };
}
