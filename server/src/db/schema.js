/**
 * HCM Lite database schema (SQLite, built into Node via `node:sqlite`).
 *
 * Design notes
 * - Every table uses TEXT uuid primary keys so ids are portable and opaque.
 * - Money is stored as INTEGER/REAL PKR amounts; booleans as 0/1; dates as ISO
 *   strings ("2026-10-24") and timestamps as ISO date-times.
 * - Attendance has a UNIQUE(employee_id, date) constraint, which is what makes
 *   the "one record per employee per day, second check-in = 409" rule safe even
 *   under concurrent requests.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  currency TEXT NOT NULL DEFAULT 'PKR',
  office_start TEXT NOT NULL DEFAULT '09:00',
  office_end TEXT NOT NULL DEFAULT '18:00',
  grace_minutes INTEGER NOT NULL DEFAULT 15,
  half_day_hours REAL NOT NULL DEFAULT 5,
  workday_hours REAL NOT NULL DEFAULT 8,
  weekend_days TEXT NOT NULL DEFAULT '[6,0]',
  office_lat REAL,
  office_lng REAL,
  office_radius REAL NOT NULL DEFAULT 150,
  office_label TEXT NOT NULL DEFAULT '',
  max_gps_accuracy REAL NOT NULL DEFAULT 100,
  late_penalty INTEGER NOT NULL DEFAULT 1,
  tax_slabs TEXT NOT NULL DEFAULT '[]',
  setup_completed_at TEXT,
  setup_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','hr','employee')),
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  temp_password_issued_at TEXT,
  last_login_at TEXT,
  password_changed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  head_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS designations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  level TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  annual_quota INTEGER NOT NULL DEFAULT 0,
  is_paid INTEGER NOT NULL DEFAULT 1,
  unlimited INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#7C5CFF',
  requires_reason INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'undisclosed',
  date_of_birth TEXT,
  cnic TEXT NOT NULL DEFAULT '',
  join_date TEXT NOT NULL,
  exit_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','probation','resigned','terminated')),
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  designation_id TEXT REFERENCES designations(id) ON DELETE SET NULL,
  manager_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  basic INTEGER NOT NULL DEFAULT 0,
  house_rent_pct REAL NOT NULL DEFAULT 40,
  medical_pct REAL NOT NULL DEFAULT 10,
  other_allowances INTEGER NOT NULL DEFAULT 0,
  bank_name TEXT NOT NULL DEFAULT '',
  account_title TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL DEFAULT '',
  emergency_name TEXT NOT NULL DEFAULT '',
  emergency_phone TEXT NOT NULL DEFAULT '',
  emergency_relation TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_emp_status ON employees(status);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in_at TEXT,
  check_out_at TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  worked_minutes INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'web',
  face_verified INTEGER NOT NULL DEFAULT 0,
  in_lat REAL, in_lng REAL, in_accuracy REAL, in_distance REAL,
  in_ip TEXT NOT NULL DEFAULT '', in_ua TEXT NOT NULL DEFAULT '',
  out_lat REAL, out_lng REAL, out_accuracy REAL, out_distance REAL,
  out_ip TEXT NOT NULL DEFAULT '', out_ua TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  corrected_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  attendance_id TEXT,
  requested_check_in TEXT NOT NULL DEFAULT '',
  requested_check_out TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by TEXT,
  decided_at TEXT,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  applied_via TEXT NOT NULL DEFAULT 'web',
  decided_by TEXT,
  decided_at TEXT,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_requests(employee_id, start_date);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  working_days INTEGER NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  total_gross REAL NOT NULL DEFAULT 0,
  total_prorated_gross REAL NOT NULL DEFAULT 0,
  total_deductions REAL NOT NULL DEFAULT 0,
  total_tax REAL NOT NULL DEFAULT 0,
  total_net REAL NOT NULL DEFAULT 0,
  prepared_by TEXT,
  finalized_by TEXT,
  finalized_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  snapshot_name TEXT NOT NULL DEFAULT '',
  snapshot_code TEXT NOT NULL DEFAULT '',
  snapshot_department TEXT NOT NULL DEFAULT '',
  snapshot_designation TEXT NOT NULL DEFAULT '',
  snapshot_join_date TEXT,
  snapshot_bank TEXT NOT NULL DEFAULT '',
  snapshot_account TEXT NOT NULL DEFAULT '',
  basic REAL NOT NULL DEFAULT 0,
  hra REAL NOT NULL DEFAULT 0,
  medical REAL NOT NULL DEFAULT 0,
  other_allowances REAL NOT NULL DEFAULT 0,
  gross REAL NOT NULL DEFAULT 0,
  eligible_days INTEGER NOT NULL DEFAULT 0,
  working_days INTEGER NOT NULL DEFAULT 0,
  present_days REAL NOT NULL DEFAULT 0,
  late_days INTEGER NOT NULL DEFAULT 0,
  absent_days REAL NOT NULL DEFAULT 0,
  half_days REAL NOT NULL DEFAULT 0,
  paid_leave_days REAL NOT NULL DEFAULT 0,
  unpaid_leave_days REAL NOT NULL DEFAULT 0,
  per_day REAL NOT NULL DEFAULT 0,
  prorated_gross REAL NOT NULL DEFAULT 0,
  absence_deduction REAL NOT NULL DEFAULT 0,
  unpaid_deduction REAL NOT NULL DEFAULT 0,
  half_day_deduction REAL NOT NULL DEFAULT 0,
  late_penalty_days REAL NOT NULL DEFAULT 0,
  late_penalty_deduction REAL NOT NULL DEFAULT 0,
  total_deductions REAL NOT NULL DEFAULT 0,
  taxable_income REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  breakdown TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE (run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  author_id TEXT,
  author_name TEXT NOT NULL DEFAULT '',
  author_role TEXT NOT NULL DEFAULT 'admin',
  pinned INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT NOT NULL DEFAULT 'system',
  actor_role TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  before_json TEXT,
  after_json TEXT,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'chat',
  prompt TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  tools_json TEXT NOT NULL DEFAULT '[]',
  model TEXT NOT NULL DEFAULT '',
  latency_ms INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 1,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT ''
);
`;

/** Default tax slabs from the brief (monthly, illustrative, PKR). */
export const DEFAULT_TAX_SLABS = [
  { upTo: 600000, base: 0, rate: 0 },
  { upTo: 1200000, base: 0, rate: 0.05 },
  { upTo: 2400000, base: 30000, rate: 0.15 },
  { upTo: 3600000, base: 210000, rate: 0.25 },
  { upTo: null, base: 510000, rate: 0.35 },
];

/** Leave types created during first-run setup (Admin can edit them in M2). */
export const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual Leave', code: 'ANNUAL', annualQuota: 14, isPaid: 1, color: '#7C5CFF' },
  { name: 'Sick Leave', code: 'SICK', annualQuota: 8, isPaid: 1, color: '#22D3EE' },
  { name: 'Casual Leave', code: 'CASUAL', annualQuota: 10, isPaid: 1, color: '#4ADE80' },
  { name: 'Unpaid Leave', code: 'UNPAID', annualQuota: 0, isPaid: 0, unlimited: 1, color: '#FFB86B' },
];
