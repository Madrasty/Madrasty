import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../auth/auth.middleware';
import { DrizzleLearningProgramsRepository } from './learning-programs.repository';
import { buildHandlerRegistry } from './lesson-types/registry';
import { ProgramsService } from './programs.service';
import { ChaptersService } from './chapters.service';
import { LessonsService } from './lessons.service';
import { BrowseService } from './browse.service';
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
export function createLearningProgramsRouter(): Router {
  const repo = new DrizzleLearningProgramsRepository();
  const handlers = buildHandlerRegistry(repo);
  const c = createLearningProgramsController({
    programs: new ProgramsService(repo),
    chapters: new ChaptersService(repo),
    lessons: new LessonsService(repo, handlers),
    browse: new BrowseService(repo, handlers),
  });

  const router = Router();
  const teacher = [requireAuth, requireRole('teacher', 'admin')] as const;

  // Authoring — '/mine' must precede '/:programId' so it isn't read as an id.
  router.get('/mine', ...teacher, c.listMine);
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

  // Public browsing (optionalAuth lets an owner/admin preview drafts + details).
  router.get('/', optionalAuth, c.listPublished);
  router.get('/:programId', optionalAuth, c.getProgram);

  return router;
}
