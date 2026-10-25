# HCM Lite

**AI-assisted Human Capital Management for Admin, HR and Employees.**
Saylani Hackathon Challenge — 24 October 2026, Zaitoon Ashraf IT Park.

HCM Lite is a working HR system, not a mock: a fresh install starts completely empty, the Admin sets up the
company and its rules, HR registers employees (which creates their logins), everyone checks in and applies
for leave, HR approves, HR drafts payroll and the Admin finalizes and locks it. On top of that sits an AI
assistant that answers HR questions **from the real database** through tool calling — never from the
model's imagination. The numbers on every dashboard are computed on the server and always match the
records.

---

## Run it in three commands

```bash
cd hcm-lite
npm run setup      # installs server + client dependencies
npm run dev        # API on :5000, web app on :5173
```

Open **http://localhost:5173**. A fresh install sends you to first-run setup — create the company and the
Admin account, and you are in. No database server, no Docker, no external services.

Requirements: **Node 22.5+** (for the built-in `node:sqlite`; developed on Node 24).

> First run asks for the company name, your Admin name, email and password, office hours, grace window,
> weekend days and the office geofence. It also creates the standard leave types (Annual 14, Sick 8,
> Casual 10, Unpaid unlimited).

---

## What is inside

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + Tailwind 3, framer-motion, **three.js / @react-three/fiber** landing scene, recharts, lucide-react, @tanstack/react-query |
| Backend | Node 22 + Express 4 (ESM), zod validation, JWT, bcryptjs, pdfkit, helmet, rate limiting |
| Database | SQLite via Node's built-in `node:sqlite` — zero setup, one file (`server/data/hcm.db`), isolated in `server/src/db/` |
| AI | Any OpenAI-compatible API with tool calling (OpenAI, Groq, OpenRouter, Gemini, Together…), plus a deterministic local rules engine when no key is set |

### Repository map

```
hcm-lite/
├─ package.json               # dev / build / start / test / reset
├─ scripts/dev.mjs            # runs API + client together
├─ server/
│  ├─ src/
│  │  ├─ config/env.js
│  │  ├─ db/{index.js,schema.js}          # connection + full schema
│  │  ├─ domain/rules.js                 # pure business rules (unit tested)
│  │  ├─ middleware/{auth,audit,error}.js
│  │  ├─ services/*.service.js           # auth, settings, org, employees, attendance,
│  │  │                                  # leave, payroll, analytics, ai, notify
│  │  ├─ routes/*.routes.js
│  │  ├─ utils/{http,date,geo,csv}.js
│  │  ├─ app.js  index.js
│  ├─ tests/rules.test.js                # 12 rule tests, `npm test`
│  └─ .env.example
└─ client/
   ├─ src/
   │  ├─ landing/{Landing,Hero,Scene,Sections}.jsx   # 3D + animated landing page
   │  ├─ components/{ui.jsx,AppShell.jsx}
   │  ├─ pages/Auth.jsx                   # login / first-run setup / change password
   │  ├─ pages/app/*.jsx                  # dashboard + every module screen
   │  ├─ context/{AuthContext,ToastContext}.jsx
   │  ├─ lib/{api.js,format.js}
   │  ├─ index.css                        # design tokens + glass/aurora utilities
   │  └─ main.jsx
   ├─ CONVENTIONS.md                      # UI rules for anyone extending the app
   └─ tailwind.config.js
```

---

## Environment

Copy the example and edit:

```bash
cd hcm-lite/server
cp .env.example .env
```

Every variable is documented in [`server/.env.example`](hcm-lite/server/.env.example). The important ones:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `5000` | API port |
| `DB_FILE` | `./data/hcm.db` | SQLite file; point it at a mounted disk when hosting |
| `JWT_SECRET` | dev value | **change in production** |
| `APP_UTC_OFFSET_MINUTES` | `300` | company-local offset used for late/payroll maths |
| `CORS_ORIGINS` | `http://localhost:5173` | comma-separated allowed origins |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | optional env bootstrap for the first Admin |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | OpenAI / empty / `gpt-4o-mini` | any tool-calling provider |

### Enabling the AI (optional but scored)

```env
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

Other working combos:

| Provider | `AI_BASE_URL` | `AI_MODEL` |
|---|---|---|
| Groq (free tier) | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Gemini (OpenAI-compatible) | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |

The key is read **only** by the server. The browser calls `/api/ai/chat`; the server calls the provider.
Without a key the assistant falls back to a deterministic rules engine that still answers headcount,
late-comers, leave balance, payroll and who-is-on-leave questions, clearly labelled.

---

## The rules the app enforces

Defaults are editable in **Admin → Settings**; the rules are applied to new records.

- **Attendance** — shift 09:00, grace 15 min (09:15 is on time, 09:16 is late), half day under 5h, weekend
  Sat + Sun, one record per employee per day (second check-in → `409`), `missing_checkout` when there is no
  check-out, `absent` when there is no record and no approved leave. The **server** stamps the time.
- **Camera check-in** — exactly one face, inside the office radius, GPS accuracy better than 100 m. The
  server recomputes the distance with the Haversine formula; the browser only sends coordinates.
- **Leave** — working days only, overlap rejected, over-balance rejected, balances derived from approved
  requests (never stored twice).
- **Payroll** — `gross = 1.5 × basic` (HRA 40% + medical 10%), `perDay = gross / working days`, deductions
  for absent days, unpaid leave, half of each half day and 0.5 day per 3 lates, pro-rating for joiners and
  leavers, progressive tax slabs, and a finalize step that **locks the month**.
- **Audit** — every create, update, approve and finalize is written with actor, IP and before/after.

---

## Testing

```bash
npm test
```

Runs the pure-rule suite (late detection, half days, attendance rate, gross, tax slabs, deductions,
pro-rating, working days, Haversine, CSV). The repository author also ran a 55-check end-to-end API pass
covering setup → login → employees → check-in → leave → payroll → payslip PDF → AI → audit.

Manual API smoke test:

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/setup
```

### End-to-end API test (55 checks, no database needed)

```bash
cd server
npm run test:e2e
```

This boots the real Express app on an in-memory SQLite database and walks the whole judged flow: setup →
HR login → employee registration → check-in → leave apply/approve → attendance correction → payroll draft
→ Admin finalize → payslip PDF → role-scope refusals → AI answers → announcements → audit log → CSV
import/export → dashboards. Expected output: `===== 55 passed, 0 failed =====`.


---

## 5-minute demo script

1. Open the live app → first-run setup: company, office hours, grace, weekend, geofence → Admin created.
2. Admin creates an HR login.
3. HR registers 2–3 employees — the temporary password is shown once, and the employee must change it on
   first sign-in.
4. Employee checks in (web, then camera + location); the HR board shows them present.
5. Employee types *"I need next Monday and Tuesday off for my sister's wedding"* → the AI pre-fills the
   leave form → confirm → HR approves → balance updates → notification.
6. HR dashboard → **Summarize** → AI insights; ask *"Who is on leave today?"* and *"Who came late most often
   this month?"* — the numbers match the screen.
7. HR generates the payroll draft, the Admin finalizes it, the employee downloads the PDF payslip.
8. Employee asks for a colleague's salary → politely refused. Admin opens the audit log and shows every
   action above.

---

## Deployment

The server serves the built client when `client/dist` exists, so a single service is enough:

```bash
npm run build          # builds client/dist
NODE_ENV=production DB_FILE=/data/hcm.db JWT_SECRET=... AI_API_KEY=... npm start
```

- **Render / Railway / Fly.io** — one web service, build command `npm run setup && npm run build`, start
  command `npm start`, and a persistent disk mounted at `/data` so the SQLite file survives deploys.
- **Split hosting** — deploy `client` to Vercel/Netlify with `VITE_API_URL` pointing at the API, and set
  `CORS_ORIGINS` on the API to the site's origin.
- Never commit `.env`. Set secrets in the hosting provider's environment settings.

---

## What is done / what is not

**Done:** all nine modules and the 25 listed functionalities, three roles with server-side scope checks,
first-run setup with no dummy data, attendance (web + camera + geofence), leave with approvals and smart
leave, payroll with per-day maths and PDF payslips, server-computed dashboards for all three roles, the AI
assistant with seven tools and graceful degradation, announcements, notifications, audit log, CSV
import/export, unit tests, and an animated 3D landing page.

**Not done (honest list):** native mobile app (the camera flow runs in the mobile browser instead), payroll
email delivery, multi-company tenancy, and the bonus "attrition risk score" / "absence anomaly flags".
