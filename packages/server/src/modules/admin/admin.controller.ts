import type { Request, Response } from 'express';
import { z } from 'zod';
import { TEACHER_VERIFICATION_STATUSES, PROGRAM_STATUSES } from '@madrasty/shared';
import { asyncHandler } from '../../lib/async-handler';
import type { AdminService } from './admin.service';

// Request locale for resolving translated program titles (mirrors the
// learning-programs controller): explicit ?locale wins, then Accept-Language.
function localeOf(req: Request): string {
  const q = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  if (q) return q;
  const header = req.headers['accept-language'];
  if (typeof header === 'string' && header.trim()) return header.split(',')[0].trim();
  return '';
}

const rejectSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() });
const teacherStatus = z.enum(TEACHER_VERIFICATION_STATUSES).optional();
const programStatus = z.enum(PROGRAM_STATUSES).optional();

export function createAdminController(service: AdminService) {
  const actor = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

  return {
    listTeachers: asyncHandler(async (req: Request, res: Response) => {
      const status = teacherStatus.parse(req.query.status) ?? 'pending';
      res.status(200).json({ teachers: await service.listPendingTeachers(status) });
    }),

    verifyTeacher: asyncHandler(async (req: Request, res: Response) => {
      await service.verifyTeacher(actor(req), req.params.userId);
      res.status(200).json({ ok: true });
    }),

    rejectTeacher: asyncHandler(async (req: Request, res: Response) => {
      const { reason } = rejectSchema.parse(req.body ?? {});
      await service.rejectTeacher(actor(req), req.params.userId, reason);
      res.status(200).json({ ok: true });
    }),

    listPrograms: asyncHandler(async (req: Request, res: Response) => {
      const status = programStatus.parse(req.query.status) ?? 'pending_review';
      res.status(200).json({ programs: await service.listPendingPrograms(status, localeOf(req)) });
    }),

    approveProgram: asyncHandler(async (req: Request, res: Response) => {
      await service.approveProgram(actor(req), req.params.programId);
      res.status(200).json({ ok: true });
    }),

    rejectProgram: asyncHandler(async (req: Request, res: Response) => {
      const { reason } = rejectSchema.parse(req.body ?? {});
      await service.rejectProgram(actor(req), req.params.programId, reason);
      res.status(200).json({ ok: true });
    }),
  };
}
