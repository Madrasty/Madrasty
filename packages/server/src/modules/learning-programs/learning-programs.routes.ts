import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../auth/auth.middleware';
import { DrizzleLearningProgramsRepository } from './learning-programs.repository';
import { buildHandlerRegistry } from './lesson-types/registry';
import { ProgramsService } from './programs.service';
import { ChaptersService } from './chapters.service';
import { LessonsService } from './lessons.service';
import { BrowseService } from './browse.service';
import { EnrollmentService } from './enrollment.service';
import { ProgressService } from './progress.service';
import { createLearningProgramsController } from './learning-programs.controller';

// Composition root. Routes (mounted at /api/learning-programs):
//   Public browsing
//     GET    /                                 list published programs (filters)
//     GET    /:programId                       program tree, visibility-gated
//   Teacher/admin authoring (owner or admin only)
//     GET    /mine                             own programs (all statuses)
//     POST   /                                 create program
//     PATCH  /:programId                       update program
//     POST   /:programId/publish               publish program
//     DELETE /:programId                       soft-delete program
//     POST   /:programId/chapters              create chapter
//     PATCH  /:programId/chapters/:chapterId   update chapter
//     DELETE /:programId/chapters/:chapterId   delete chapter
//     POST   /:programId/chapters/:chapterId/lessons               create lesson
//     PATCH  /:programId/chapters/:chapterId/lessons/:lessonId      update lesson
//     POST   /:programId/chapters/:chapterId/lessons/:lessonId/publish  publish lesson
//     DELETE /:programId/chapters/:chapterId/lessons/:lessonId      delete lesson
//     POST   /:programId/chapters/:chapterId/lessons/:lessonId/invites  invite a student (invite_only)
//     POST   /:programId/enrollments           grant enrollment (source=admin_grant) [owner/admin]
//   Student
//     GET    /my-programs                       list a student's enrolled programs
//     POST   /:programId/lessons/:lessonId/open      mark lesson opened
//     POST   /:programId/lessons/:lessonId/complete  mark lesson completed (fires onComplete)
export function createLearningProgramsRouter(): Router {
  const repo = new DrizzleLearningProgramsRepository();
  const handlers = buildHandlerRegistry(repo);
  const c = createLearningProgramsController({
    programs: new ProgramsService(repo),
    chapters: new ChaptersService(repo),
    lessons: new LessonsService(repo, handlers),
    browse: new BrowseService(repo, handlers),
    enrollment: new EnrollmentService(repo),
    progress: new ProgressService(repo, handlers),
  });

  const router = Router();
  const teacher = [requireAuth, requireRole('teacher', 'admin')] as const;
  const student = [requireAuth, requireRole('student')] as const;

  // Static author/student paths must precede '/:programId' so they aren't read as ids.
  router.get('/mine', ...teacher, c.listMine);
  router.get('/my-programs', ...student, c.listMyPrograms);
  router.post('/', ...teacher, c.createProgram);
  router.patch('/:programId', ...teacher, c.updateProgram);
  router.post('/:programId/publish', ...teacher, c.publishProgram);
  router.delete('/:programId', ...teacher, c.deleteProgram);

  router.post('/:programId/chapters', ...teacher, c.createChapter);
  router.patch('/:programId/chapters/:chapterId', ...teacher, c.updateChapter);
  router.delete('/:programId/chapters/:chapterId', ...teacher, c.deleteChapter);

  router.post('/:programId/chapters/:chapterId/lessons', ...teacher, c.createLesson);
  router.patch('/:programId/chapters/:chapterId/lessons/:lessonId', ...teacher, c.updateLesson);
  router.post('/:programId/chapters/:chapterId/lessons/:lessonId/publish', ...teacher, c.publishLesson);
  router.delete('/:programId/chapters/:chapterId/lessons/:lessonId', ...teacher, c.deleteLesson);
  router.post('/:programId/chapters/:chapterId/lessons/:lessonId/invites', ...teacher, c.addLessonInvite);

  // Enrollment grant (owner/admin) + student progress.
  router.post('/:programId/enrollments', ...teacher, c.grantEnrollment);
  router.post('/:programId/lessons/:lessonId/open', ...student, c.markLessonOpened);
  router.post('/:programId/lessons/:lessonId/complete', ...student, c.markLessonCompleted);

  // Public browsing (optionalAuth lets an owner/admin preview drafts + details).
  router.get('/', optionalAuth, c.listPublished);
  router.get('/:programId', optionalAuth, c.getProgram);

  return router;
}
