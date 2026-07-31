import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { rateLimit } from '../../lib/rate-limit';
import { buildLiveClassesService } from './index';
import { createLiveClassesController } from './live-classes.controller';

// Composition root. Routes (mounted at /api/live-classes):
//   GET  /                        my classes (teacher: own; student: enrolled)
//   GET  /:lessonId               one class + this viewer's join state
//   POST /:lessonId/start         teacher opens the room (idempotent)
//   POST /:lessonId/end           teacher closes it; absentees recorded
//   POST /:lessonId/join          mint join credentials + record attendance
//   POST /:lessonId/leave         close out the student's attendance row
//   GET  /:lessonId/attendance    the register (owner/admin)
//   POST /:lessonId/attendance    teacher corrects one student's record
//
// RBAC is coarse here and real in the service: ownership, enrollment, the
// guardian gate, and whether the class is live are all re-checked per call.
//
// `join` is rate-limited because each call mints a signed token: a client loop
// shouldn't be able to farm join credentials, even valid ones.
export function createLiveClassesRouter(): Router {
  const live = buildLiveClassesService();
  const c = createLiveClassesController(live);

  const router = Router();
  const teacher = [requireAuth, requireRole('teacher')] as const;

  router.get('/', requireAuth, c.listMine);
  router.get('/:lessonId', requireAuth, c.getLiveClass);

  router.post('/:lessonId/start', ...teacher, c.start);
  router.post('/:lessonId/end', ...teacher, c.end);

  router.post(
    '/:lessonId/join',
    requireAuth,
    rateLimit({ name: 'live-join', max: 20, windowSeconds: 60 }),
    c.join,
  );
  router.post('/:lessonId/leave', requireAuth, c.leave);

  router.get('/:lessonId/attendance', requireAuth, c.getRoster);
  router.post('/:lessonId/attendance', ...teacher, c.setAttendance);

  return router;
}
