import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, assertSchema } from '../utils/http.js';
import { setupStatus, completeSetup, findUserById, publicUser } from '../services/auth.service.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

const setupSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  adminName: z.string().min(2, 'Your name is required'),
  adminEmail: z.string().email('Enter a valid email'),
  adminPassword: z.string().min(8, 'Use at least 8 characters'),
  officeStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  graceMinutes: z.coerce.number().min(0).max(120).optional(),
  weekendDays: z.array(z.number().min(0).max(6)).optional(),
  office: z
    .object({
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      radius: z.coerce.number().min(20).max(5000).optional(),
      label: z.string().optional(),
    })
    .optional(),
});

router.get('/', (_req, res) => ok(res, setupStatus()));

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = assertSchema(setupSchema, req.body);
    const { adminId } = await completeSetup({
      companyName: body.companyName,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPassword: body.adminPassword,
      company: {
        officeStart: body.officeStart,
        graceMinutes: body.graceMinutes,
        weekendDays: body.weekendDays,
        office: body.office,
      },
    });
    const user = findUserById(adminId);
    res.status(201).json({
      data: { token: signToken(user), user: publicUser(user) },
    });
  }),
);

export default router;
