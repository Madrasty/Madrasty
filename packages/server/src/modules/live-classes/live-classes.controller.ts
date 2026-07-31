import type { Request, Response } from 'express';
import type { SetAttendanceRequest } from '@madrasty/shared';
import { config } from '../../config/index';
import { asyncHandler } from '../../lib/async-handler';
import type { Actor, LiveClassesService } from './live-classes.service';
import { setAttendanceSchema } from './live-classes.schemas';

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

export function createLiveClassesController(live: LiveClassesService) {
  return {
    // GET / — my live classes: a teacher's own, or a student's enrolled ones.
    listMine: asyncHandler(async (req: Request, res: Response) => {
      const result = await live.listMine(actorOf(req), localeOf(req));
      res.status(200).json(result);
    }),

    // GET /:lessonId — one class, with this viewer's join state.
    getLiveClass: asyncHandler(async (req: Request, res: Response) => {
      const view = await live.getLiveClass(actorOf(req), req.params.lessonId, localeOf(req));
      res.status(200).json(view);
    }),

    // POST /:lessonId/start — teacher opens the room (idempotent).
    start: asyncHandler(async (req: Request, res: Response) => {
      const view = await live.start(actorOf(req), req.params.lessonId, localeOf(req));
      res.status(200).json(view);
    }),

    // POST /:lessonId/end — teacher closes the room; absentees are recorded.
    end: asyncHandler(async (req: Request, res: Response) => {
      const result = await live.end(actorOf(req), req.params.lessonId, localeOf(req));
      res.status(200).json(result);
    }),

    // POST /:lessonId/join — mint join credentials and record attendance.
    join: asyncHandler(async (req: Request, res: Response) => {
      const result = await live.join(actorOf(req), req.params.lessonId, localeOf(req));
      res.status(200).json(result);
    }),

    // POST /:lessonId/leave — close out the student's attendance row.
    leave: asyncHandler(async (req: Request, res: Response) => {
      const result = await live.leave(actorOf(req), req.params.lessonId);
      res.status(200).json(result);
    }),

    // GET /:lessonId/attendance — the register (owner/admin).
    getRoster: asyncHandler(async (req: Request, res: Response) => {
      const result = await live.getRoster(actorOf(req), req.params.lessonId, localeOf(req));
      res.status(200).json(result);
    }),

    // POST /:lessonId/attendance — teacher corrects one student's record.
    setAttendance: asyncHandler(async (req: Request, res: Response) => {
      const body = setAttendanceSchema.parse(req.body) as SetAttendanceRequest;
      const result = await live.setAttendance(actorOf(req), req.params.lessonId, body);
      res.status(200).json(result);
    }),
  };
}
