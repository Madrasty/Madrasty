import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { buildAcademicRecordsService } from './index';
import { createAcademicRecordsController } from './academic-records.controller';

// Composition root. Routes (mounted at /api/academic-records):
//   POST /exams                              teacher creates an exam
//   GET  /exams                              the teacher's own exams
//   GET  /exams/:id/gradebook                roster + results (owner / admin audit)
//   PUT  /exams/:id/results                  record/update a student's grade (owner)
//   GET  /students/:studentId/report-card    aggregated report card
//
// RBAC: coarse role gating here; per-record ownership (exam owner, approved
// guardian, student-self) is enforced in the service (doc 10 §6).
export function createAcademicRecordsRouter(): Router {
  const academic = buildAcademicRecordsService();
  const c = createAcademicRecordsController(academic);

  const router = Router();
  const teacher = [requireAuth, requireRole('teacher')] as const;

  router.post('/exams', ...teacher, c.createExam);
  router.get('/exams', ...teacher, c.listMyExams);
  router.get(
    '/exams/:id/gradebook',
    requireAuth,
    requireRole('teacher', 'admin', 'center_admin'),
    c.getGradebook,
  );
  router.put('/exams/:id/results', ...teacher, c.recordResult);

  router.get(
    '/students/:studentId/report-card',
    requireAuth,
    requireRole('student', 'parent', 'admin', 'center_admin'),
    c.getReportCard,
  );

  return router;
}
