import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { rateLimit } from '../../lib/rate-limit';
import { buildQuizzesService } from './index';
import { createQuizzesController } from './quizzes.controller';

// Composition root. Routes (mounted at /api/quizzes):
//   POST   /quizzes                         teacher creates a quiz on a quiz-lesson
//   POST   /quizzes/:id/questions           add a question (owner)
//   DELETE /quizzes/:id/questions/:qid      remove a question (owner)
//   GET    /quizzes/by-lesson/:lessonId     resolve the quiz id for a lesson
//   GET    /quizzes/:id                     owner/admin get answers; student takes
//   POST   /quizzes/:id/attempts            submit answers, auto-graded (student)
//   GET    /quizzes/:id/attempts/me         the caller's past attempts (student)
//
// RBAC: coarse role gating here; per-record ownership / enrollment is enforced in
// the service (doc 12 §6).
export function createQuizzesRouter(): Router {
  const quizzes = buildQuizzesService();
  const c = createQuizzesController(quizzes);

  const router = Router();
  const teacher = [requireAuth, requireRole('teacher')] as const;

  router.post('/quizzes', ...teacher, c.createQuiz);
  router.post('/quizzes/:id/questions', ...teacher, c.addQuestion);
  router.delete('/quizzes/:id/questions/:questionId', ...teacher, c.deleteQuestion);

  router.get('/quizzes/by-lesson/:lessonId', requireAuth, c.getByLesson);
  router.get('/quizzes/:id', requireAuth, c.getQuiz);

  router.post(
    '/quizzes/:id/attempts',
    requireAuth,
    requireRole('student'),
    rateLimit({ name: 'quiz-attempt', max: 30, windowSeconds: 60 }),
    c.submitAttempt,
  );
  router.get('/quizzes/:id/attempts/me', requireAuth, requireRole('student'), c.listMyAttempts);

  return router;
}
