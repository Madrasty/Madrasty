import type { Request, Response } from 'express';
import type {
  CreateAssignmentRequest,
  GradeHomeworkRequest,
  SubmitHomeworkRequest,
  UpdateAssignmentRequest,
} from '@madrasty/shared';
import { config } from '../../config/index';
import { asyncHandler } from '../../lib/async-handler';
import type { Actor, HomeworkService } from './homework.service';
import {
  createAssignmentSchema,
  gradeHomeworkSchema,
  submitHomeworkSchema,
  updateAssignmentSchema,
} from './homework.schemas';

function localeOf(req: Request): string {
  const supported = config.SUPPORTED_LOCALES;
  const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  if (queryLocale && supported.includes(queryLocale)) return queryLocale;
  const header = req.headers['accept-language'];
  if (header) {
    for (const part of header.split(',')) {
      const tag = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
      if (tag && supported.includes(tag)) return tag;
    }
  }
  return config.DEFAULT_LOCALE;
}

function actorOf(req: Request): Actor {
  return { id: req.user!.id, role: req.user!.role };
}

export function createHomeworkController(homework: HomeworkService) {
  return {
    // POST /assignments — teacher creates an assignment on a homework-type lesson.
    createAssignment: asyncHandler(async (req: Request, res: Response) => {
      const body = createAssignmentSchema.parse(req.body) as CreateAssignmentRequest;
      const view = await homework.createAssignment(actorOf(req), body, localeOf(req));
      res.status(201).json(view);
    }),

    // PATCH /assignments/:id — edit brief / deadline / max grade (owner).
    updateAssignment: asyncHandler(async (req: Request, res: Response) => {
      const body = updateAssignmentSchema.parse(req.body) as UpdateAssignmentRequest;
      const view = await homework.updateAssignment(
        actorOf(req),
        req.params.id,
        body,
        localeOf(req),
      );
      res.status(200).json(view);
    }),

    // GET /assignments/by-lesson/:lessonId — resolve the assignment id for a lesson.
    getByLesson: asyncHandler(async (req: Request, res: Response) => {
      const result = await homework.getAssignmentIdByLesson(req.params.lessonId);
      res.status(200).json(result);
    }),

    // GET /assignments/:id — owner/admin get counts; enrolled student gets the
    // brief + their own submission.
    getAssignment: asyncHandler(async (req: Request, res: Response) => {
      const view = await homework.getAssignment(actorOf(req), req.params.id, localeOf(req));
      res.status(200).json(view);
    }),

    // POST /assignments/:id/submissions — student submits or replaces their text.
    submit: asyncHandler(async (req: Request, res: Response) => {
      const body = submitHomeworkSchema.parse(req.body) as SubmitHomeworkRequest;
      const view = await homework.submit(actorOf(req), req.params.id, body, localeOf(req));
      res.status(201).json(view);
    }),

    // GET /assignments/:id/submissions — the teacher's grading queue (owner/admin).
    listSubmissions: asyncHandler(async (req: Request, res: Response) => {
      const result = await homework.listSubmissions(actorOf(req), req.params.id, localeOf(req));
      res.status(200).json(result);
    }),

    // POST /submissions/:id/grade — teacher records a grade + comment (owner).
    grade: asyncHandler(async (req: Request, res: Response) => {
      const body = gradeHomeworkSchema.parse(req.body) as GradeHomeworkRequest;
      const view = await homework.grade(actorOf(req), req.params.id, body);
      res.status(200).json(view);
    }),
  };
}
