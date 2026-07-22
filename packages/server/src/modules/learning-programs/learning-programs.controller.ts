import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import type { Actor, Viewer } from './types';
import type { ProgramsService } from './programs.service';
import type { ChaptersService } from './chapters.service';
import type { LessonsService } from './lessons.service';
import type { BrowseService } from './browse.service';
import {
  createChapterSchema,
  createLessonSchema,
  createProgramSchema,
  listProgramsQuerySchema,
  updateChapterSchema,
  updateLessonSchema,
  updateProgramSchema,
} from './learning-programs.schemas';

// req.user is guaranteed by requireAuth on write routes.
function actorOf(req: Request): Actor {
  return { id: req.user!.id, role: req.user!.role };
}
// req.user is optional on public read routes (optionalAuth).
function viewerOf(req: Request): Viewer {
  return {
    userId: req.user?.id ?? null,
    role: req.user?.role ?? null,
    // Enrollment/payments not built yet — the public is treated as un-purchased.
    hasPurchased: false,
  };
}

export interface LearningProgramsServices {
  programs: ProgramsService;
  chapters: ChaptersService;
  lessons: LessonsService;
  browse: BrowseService;
}

export function createLearningProgramsController(s: LearningProgramsServices) {
  return {
    // --- Programs (teacher/admin) ---
    createProgram: asyncHandler(async (req: Request, res: Response) => {
      const body = createProgramSchema.parse(req.body);
      res.status(201).json(await s.programs.create(actorOf(req), body));
    }),
    updateProgram: asyncHandler(async (req: Request, res: Response) => {
      const body = updateProgramSchema.parse(req.body);
      res.status(200).json(await s.programs.update(actorOf(req), req.params.programId, body));
    }),
    publishProgram: asyncHandler(async (req: Request, res: Response) => {
      res.status(200).json(await s.programs.publish(actorOf(req), req.params.programId));
    }),
    deleteProgram: asyncHandler(async (req: Request, res: Response) => {
      await s.programs.remove(actorOf(req), req.params.programId);
      res.status(200).json({ success: true });
    }),
    listMine: asyncHandler(async (req: Request, res: Response) => {
      res.status(200).json({ programs: await s.programs.listMine(actorOf(req)) });
    }),

    // --- Chapters (teacher/admin) ---
    createChapter: asyncHandler(async (req: Request, res: Response) => {
      const body = createChapterSchema.parse(req.body);
      res.status(201).json(await s.chapters.create(actorOf(req), req.params.programId, body));
    }),
    updateChapter: asyncHandler(async (req: Request, res: Response) => {
      const body = updateChapterSchema.parse(req.body);
      const result = await s.chapters.update(
        actorOf(req),
        req.params.programId,
        req.params.chapterId,
        body,
      );
      res.status(200).json(result);
    }),
    deleteChapter: asyncHandler(async (req: Request, res: Response) => {
      await s.chapters.remove(actorOf(req), req.params.programId, req.params.chapterId);
      res.status(200).json({ success: true });
    }),

    // --- Lessons (teacher/admin) ---
    createLesson: asyncHandler(async (req: Request, res: Response) => {
      const body = createLessonSchema.parse(req.body);
      const result = await s.lessons.create(
        actorOf(req),
        req.params.programId,
        req.params.chapterId,
        body,
      );
      res.status(201).json(result);
    }),
    updateLesson: asyncHandler(async (req: Request, res: Response) => {
      const body = updateLessonSchema.parse(req.body);
      const result = await s.lessons.update(
        actorOf(req),
        req.params.programId,
        req.params.chapterId,
        req.params.lessonId,
        body,
      );
      res.status(200).json(result);
    }),
    publishLesson: asyncHandler(async (req: Request, res: Response) => {
      const result = await s.lessons.publish(
        actorOf(req),
        req.params.programId,
        req.params.chapterId,
        req.params.lessonId,
      );
      res.status(200).json(result);
    }),
    deleteLesson: asyncHandler(async (req: Request, res: Response) => {
      await s.lessons.remove(
        actorOf(req),
        req.params.programId,
        req.params.chapterId,
        req.params.lessonId,
      );
      res.status(200).json({ success: true });
    }),

    // --- Public browsing ---
    listPublished: asyncHandler(async (req: Request, res: Response) => {
      const query = listProgramsQuerySchema.parse(req.query);
      res.status(200).json({ programs: await s.browse.listPublished(query) });
    }),
    getProgram: asyncHandler(async (req: Request, res: Response) => {
      res.status(200).json(await s.browse.getProgramContent(req.params.programId, viewerOf(req)));
    }),
  };
}
