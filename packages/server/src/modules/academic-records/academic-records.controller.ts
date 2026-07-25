import type { Request, Response } from 'express';
import type { CreateExamRequest, RecordResultRequest } from '@madrasty/shared';
import { config } from '../../config/index';
import { asyncHandler } from '../../lib/async-handler';
import type { Actor, AcademicRecordsService } from './academic-records.service';
import { createExamSchema, recordResultSchema } from './academic-records.schemas';

// `?locale=` wins, then Accept-Language, else the default (mirrors the other
// modules until a shared i18n middleware attaches req.locale — doc 07).
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

export function createAcademicRecordsController(academic: AcademicRecordsService) {
  return {
    // POST /exams — teacher creates an exam.
    createExam: asyncHandler(async (req: Request, res: Response) => {
      const body = createExamSchema.parse(req.body) as CreateExamRequest;
      const exam = await academic.createExam(actorOf(req), body, localeOf(req));
      res.status(201).json(exam);
    }),

    // GET /exams — the teacher's own exams.
    listMyExams: asyncHandler(async (req: Request, res: Response) => {
      const exams = await academic.listMyExams(actorOf(req), localeOf(req));
      res.status(200).json({ exams });
    }),

    // GET /exams/:id/gradebook — roster + results for grading (owner/admin).
    getGradebook: asyncHandler(async (req: Request, res: Response) => {
      const gradebook = await academic.getGradebook(actorOf(req), req.params.id, localeOf(req));
      res.status(200).json(gradebook);
    }),

    // PUT /exams/:id/results — record (or update) a student's grade.
    recordResult: asyncHandler(async (req: Request, res: Response) => {
      const body = recordResultSchema.parse(req.body) as RecordResultRequest;
      const row = await academic.recordResult(actorOf(req), req.params.id, body, localeOf(req));
      res.status(200).json(row);
    }),

    // GET /students/:studentId/report-card — aggregated report card.
    getReportCard: asyncHandler(async (req: Request, res: Response) => {
      const term = typeof req.query.term === 'string' ? req.query.term : undefined;
      const card = await academic.getReportCard(
        actorOf(req),
        req.params.studentId,
        term,
        localeOf(req),
      );
      res.status(200).json(card);
    }),
  };
}
