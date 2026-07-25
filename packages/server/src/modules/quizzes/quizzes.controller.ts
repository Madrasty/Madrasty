import type { Request, Response } from 'express';
import type {
  CreateQuestionRequest,
  CreateQuizRequest,
  SubmitAttemptRequest,
} from '@madrasty/shared';
import { config } from '../../config/index';
import { asyncHandler } from '../../lib/async-handler';
import type { Actor, QuizzesService } from './quizzes.service';
import { createQuestionSchema, createQuizSchema, submitAttemptSchema } from './quizzes.schemas';

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

export function createQuizzesController(quizzes: QuizzesService) {
  return {
    // POST /quizzes — teacher creates a quiz on a quiz-type lesson.
    createQuiz: asyncHandler(async (req: Request, res: Response) => {
      const body = createQuizSchema.parse(req.body) as CreateQuizRequest;
      const quiz = await quizzes.createQuiz(actorOf(req), body, localeOf(req));
      res.status(201).json(quiz);
    }),

    // POST /quizzes/:id/questions — add a question (owner).
    addQuestion: asyncHandler(async (req: Request, res: Response) => {
      const body = createQuestionSchema.parse(req.body) as CreateQuestionRequest;
      const question = await quizzes.addQuestion(actorOf(req), req.params.id, body, localeOf(req));
      res.status(201).json(question);
    }),

    // DELETE /quizzes/:id/questions/:questionId — remove a question (owner).
    deleteQuestion: asyncHandler(async (req: Request, res: Response) => {
      await quizzes.deleteQuestion(actorOf(req), req.params.id, req.params.questionId);
      res.status(204).send();
    }),

    // GET /quizzes/:id — owner/admin get answers; enrolled student gets a takeable
    // view (answers hidden) + their best attempt.
    getQuiz: asyncHandler(async (req: Request, res: Response) => {
      const quiz = await quizzes.getQuiz(actorOf(req), req.params.id, localeOf(req));
      res.status(200).json(quiz);
    }),

    // GET /quizzes/by-lesson/:lessonId — resolve the quiz id for a lesson.
    getByLesson: asyncHandler(async (req: Request, res: Response) => {
      const result = await quizzes.getQuizIdByLesson(req.params.lessonId);
      res.status(200).json(result);
    }),

    // POST /quizzes/:id/attempts — submit answers, auto-graded (student).
    submitAttempt: asyncHandler(async (req: Request, res: Response) => {
      const body = submitAttemptSchema.parse(req.body) as SubmitAttemptRequest;
      const result = await quizzes.submitAttempt(actorOf(req), req.params.id, body, localeOf(req));
      res.status(201).json(result);
    }),

    // GET /quizzes/:id/attempts/me — the caller's past attempts (student).
    listMyAttempts: asyncHandler(async (req: Request, res: Response) => {
      const attempts = await quizzes.listMyAttempts(actorOf(req), req.params.id);
      res.status(200).json({ attempts });
    }),
  };
}
