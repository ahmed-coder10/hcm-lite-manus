# HCM Lite implementation plan

## Product approach
HCM Lite is a fresh-install, full-stack HCM product for Saylani Hackathon judging. The app starts empty and guides an Admin through one-time setup. HR then creates employee accounts; employees use scoped attendance, leave, payroll and assistant workflows; Admin finalizes payroll and can inspect the append-only audit trail.

## Architecture
- `client/`: React 18 + Vite + React Router, Tailwind, Framer Motion, Recharts, Lucide, React Query, and a lazy-loaded Three.js landing scene.
- `server/`: Express REST API with SQLite persistence through Node's built-in `node:sqlite`, JWT authentication, bcryptjs, Zod validation, rate limiting, Helmet, PDFKit payslips, audit middleware and backend-only AI provider integration.
- `server/src/domain/rules.js`: pure attendance, working-day, leave, payroll, tax and analytics calculations for deterministic tests.
- `server/src/services/`: business rules and permission checks kept out of route handlers.
- `server/tests/`: rules and end-to-end API coverage.

## Design system
Chosen style: **Aurora Glass / editorial operations cockpit**.

Core principles: dramatic but restrained aurora depth on the public landing page; operational screens stay high-contrast and readable; every action explains its state; motion communicates hierarchy rather than decoration.

Color philosophy: ink and raised-ink surfaces create focus, violet is the owning action color, cyan signals clarity and system feedback, mint communicates healthy outcomes, amber signals attention, and rose marks consequential or risky states.

Layout paradigm: an asymmetric editorial landing page with a focused, collapsible application shell; tables scroll within their own containers and forms remain single-column and touch-safe on small screens.

Signature elements: gradient hairlines, aurora orb/particle lighting, and mono micro-labels for system status. Interactions use 150–300ms transitions, reduced-motion fallbacks, visible keyboard focus, and 44px controls.

Typography: Sora-style display hierarchy through the existing display font token, Inter-like body text, and JetBrains Mono for labels and operational metadata.

Brand essence: **human capital, answered** — a calm, secure operating layer for small teams. Personality: confident, clear, humane.

Brand voice examples: “Human capital, answered.” and “Your people ops, with guardrails.”

## Delivery assumptions
SQLite is used instead of MongoDB because it keeps the hackathon deployment zero-setup while preserving a replaceable repository/service boundary. The target copy intentionally excludes the neighboring local database and starts with no business records. Hosted AI is optional; the server exposes a clearly labelled deterministic fallback when no provider key is configured.
