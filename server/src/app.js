import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { authenticate } from './middleware/auth.js';
import setupRoutes from './routes/setup.routes.js';
import authRoutes from './routes/auth.routes.js';
import orgRoutes from './routes/org.routes.js';
import userRoutes from './routes/users.routes.js';
import employeeRoutes from './routes/employees.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import leaveRoutes from './routes/leave.routes.js';
import payrollRoutes from './routes/payroll.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import aiRoutes from './routes/ai.routes.js';
import commsRoutes from './routes/comms.routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));

  const allowList = env.corsOrigins;
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowList.includes('*') || allowList.includes(origin)) return callback(null, true);
        // Same-origin requests behind a proxy have no Origin header; anything
        // else must be explicitly allowed.
        return callback(null, allowList.length === 0);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (!env.isProd) app.use(morgan('dev'));

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1200,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { message: 'Too many requests. Please slow down.' } },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ data: { status: 'ok', uptime: Math.round(process.uptime()), env: env.nodeEnv, time: new Date().toISOString() } });
  });

  app.use('/api/setup', setupRoutes);
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 60,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { message: 'Too many sign-in attempts. Try again in a few minutes.' } },
    }),
    authRoutes,
  );

  // Everything below requires a valid JWT; role checks live in each router.
  app.use('/api/org', authenticate, orgRoutes);
  app.use('/api/users', authenticate, userRoutes);
  app.use('/api/employees', authenticate, employeeRoutes);
  app.use('/api/attendance', authenticate, attendanceRoutes);
  app.use('/api/leave', authenticate, leaveRoutes);
  app.use('/api/payroll', authenticate, payrollRoutes);
  app.use('/api/analytics', authenticate, analyticsRoutes);
  app.use('/api/ai', authenticate, aiRoutes);
  app.use('/api', authenticate, commsRoutes);

  // Production: serve the built SPA from the same origin (single-service deploy).
  const clientDist = path.resolve(here, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
