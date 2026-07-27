import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { rateLimit } from '../../lib/rate-limit';
import { buildHomeworkService } from './index';
import { createHomeworkController } from './homework.controller';

// Composition root. Routes (mounted at /api/homework):
//   POST   /assignments                       teacher creates an assignment
//   PATCH  /assignments/:id                   edit brief/deadline/max grade (owner)
//   GET    /assignments/by-lesson/:lessonId   resolve the assignment id for a lesson
//   GET    /assignments/:id                   owner/admin counts; student brief + own submission
//   POST   /assignments/:id/submissions       submit / replace an answer (student)
//   GET    /assignments/:id/submissions       grading queue (owner/admin)
//   POST   /submissions/:id/grade             record a grade + comment (owner)
//
// RBAC: coarse role gating here; per-record ownership / enrollment is enforced in
// the service (doc 12 §6).
export function createHomeworkRouter(): Router {
  const homework = buildHomeworkService();
  const c = createHomeworkController(homework);

  const router = Router();
  const teacher = [requireAuth, requireRole('teacher')] as const;

  router.post('/assignments', ...teacher, c.createAssignment);
  router.patch('/assignments/:id', ...teacher, c.updateAssignment);

  router.get('/assignments/by-lesson/:lessonId', requireAuth, c.getByLesson);
  router.get('/assignments/:id', requireAuth, c.getAssignment);
  router.get('/assignments/:id/submissions', requireAuth, c.listSubmissions);

  router.post(
    '/assignments/:id/submissions',
    requireAuth,
    requireRole('student'),
    rateLimit({ name: 'homework-submit', max: 30, windowSeconds: 60 }),
    c.submit,
  );
  router.post('/submissions/:id/grade', ...teacher, c.grade);

  return router;
}
