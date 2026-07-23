import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { DrizzleAdminRepository } from './admin.repository';
import { AdminService } from './admin.service';
import { createAdminController } from './admin.controller';

// Composition root. Routes (mounted at /api/admin) — all admin-only (doc 09).
// Governance actions (verify/reject/approve/reject) each write admin_audit_log.
//   GET    /teachers?status=pending            teacher verification queue
//   POST   /teachers/:userId/verify            mark a teacher verified
//   POST   /teachers/:userId/reject            reject a teacher (reason)
//   GET    /programs?status=pending_review     program approval queue
//   POST   /programs/:programId/approve        publish a submitted program
//   POST   /programs/:programId/reject         return a program to draft (reason)
export function createAdminRouter(): Router {
  const repo = new DrizzleAdminRepository();
  const c = createAdminController(new AdminService(repo));

  const router = Router();
  const admin = [requireAuth, requireRole('admin')] as const;

  router.get('/teachers', ...admin, c.listTeachers);
  router.post('/teachers/:userId/verify', ...admin, c.verifyTeacher);
  router.post('/teachers/:userId/reject', ...admin, c.rejectTeacher);

  router.get('/programs', ...admin, c.listPrograms);
  router.post('/programs/:programId/approve', ...admin, c.approveProgram);
  router.post('/programs/:programId/reject', ...admin, c.rejectProgram);

  return router;
}
