# HCM Lite delivery outcomes

- [x] Fresh install starts at one-time First-Run Setup, creates the Admin and standard leave types, and does not seed invented employees, attendance, salaries, payroll or dashboard figures.
- [x] Authentication covers sign-in/out, forced temporary-password change, session handling, generic invalid-credential behavior, reset/change-password routes, account deactivation and role-based redirects.
- [x] Server-enforced role scopes distinguish Admin, HR and Employee access on dashboards, records, exports, generated payslips, notifications and AI tools.
- [x] Organization administration covers settings, departments, designations, leave rules, holidays, users, announcements and audit visibility.
- [x] Employee workflows cover searchable directory, employee detail, salary structure, CSV validation/dry-run/import/export and employee contact/profile boundaries.
- [x] Attendance covers server-stamped check-in/out, one-record-per-local-day conflicts, late threshold at 09:16, half-day and missing-checkout rules, calendar/board views and correction decisions.
- [x] Leave covers working-day calculation excluding weekends/holidays, balances derived from approved requests, overlap/over-balance validation, apply/cancel, inbox decisions, comments, notifications and smart-leave parsing.
- [x] Payroll covers gross/HRA/medical calculations, deductions, proration, progressive tax, draft/review flow, Admin-only finalization lock and scoped PDF payslips.
- [x] Dashboards and analytics aggregate server-side and support the required attendance, late, absenteeism, leave and headcount metrics.
- [x] AI is backend-only, permission-scoped, rate-limited, labelled AI-generated, grounded in the same services as REST, and refuses unauthorized colleague salary requests; local fallback is explicit when no key is configured.
- [x] Landing page includes the Aurora Glass 3D showpiece, accessible module sections, timeline, AI showcase, FAQ, CTA, responsive navigation, scroll progress, reduced-motion behavior and no fabricated HR metrics.
- [x] Delivery hygiene includes `.env.example`, `.gitignore`, route manifest, local setup/test/build documentation, no database artifact in source control, and a fresh production client build.

## Still optional / platform dependent

- [ ] Configure a hosted AI provider key and SMTP credentials for production email delivery.
- [ ] Deploy the single service to a host with persistent storage and replace the README hosted URL placeholder.
- [ ] Native mobile app and bonus attrition/anomaly scoring remain outside the requested web deliverable.
