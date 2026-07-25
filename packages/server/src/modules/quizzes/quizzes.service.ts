import type {
  AttemptResultView,
  AttemptSummary,
  CreateQuestionRequest,
  CreateQuizRequest,
  QuizByLessonResponse,
  QuizQuestionType,
  QuizQuestionView,
  QuizView,
  SubmitAttemptRequest,
  UserRole,
} from '@madrasty/shared';
import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import type {
  AttemptRow,
  QuestionRow,
  QuizRow,
  QuizzesRepository,
} from './quizzes.repository';

export interface Actor {
  id: string;
  role: UserRole;
}

interface RawOption {
  id: string;
  text: Record<string, string>;
}

function isAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'center_admin';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function resolveLocalized(value: unknown, locale: string, defaultLocale: string): string | null {
  const map = (value ?? {}) as Record<string, string>;
  return map[locale] ?? map[defaultLocale] ?? Object.values(map)[0] ?? null;
}

// Quizzes (doc 03, doc 12 §6). Policy:
// - Only the owning teacher authors a quiz / its questions (the quiz's program
//   must be theirs); admins may view.
// - Only a student ENROLLED in the quiz's program may take it; the correct
//   answers are never sent before submission.
// - A passing attempt completes the quiz's lesson → powers "Locked until Quiz
//   Passed" gating (doc 12 §5).
export class QuizzesService {
  constructor(private readonly repo: QuizzesRepository) {}

  private get defaultLocale(): string {
    return config.DEFAULT_LOCALE;
  }

  async createQuiz(actor: Actor, req: CreateQuizRequest, locale: string): Promise<QuizView> {
    const info = await this.repo.resolveLessonInfo(req.lessonId);
    if (!info) throw HttpError.notFound('lesson_not_found', 'Lesson not found.');
    if (info.lessonType !== 'quiz') {
      throw HttpError.badRequest('not_a_quiz_lesson', 'This lesson is not a quiz-type lesson.');
    }
    if (!(await this.repo.teacherOwnsProgram(actor.id, info.programId))) {
      throw HttpError.forbidden('not_your_program', 'You do not own this program.');
    }
    if (await this.repo.getQuizByLesson(req.lessonId)) {
      throw HttpError.conflict('quiz_exists', 'This lesson already has a quiz.');
    }
    const passingScore = req.passingScore ?? 60;
    if (passingScore < 0 || passingScore > 100) {
      throw HttpError.badRequest('invalid_passing_score', 'passingScore must be 0–100.');
    }
    const quiz = await this.repo.createQuiz({
      lessonId: req.lessonId,
      programId: info.programId,
      teacherId: actor.id,
      passingScore,
      timeLimitMinutes: req.timeLimitMinutes ?? null,
    });
    return this.toQuizView(quiz, [], null, true, locale);
  }

  async addQuestion(
    actor: Actor,
    quizId: string,
    req: CreateQuestionRequest,
    locale: string,
  ): Promise<QuizQuestionView> {
    const quiz = await this.requireQuiz(quizId);
    this.assertOwner(actor, quiz);

    const prompt = this.cleanLocalized(req.prompt, 'prompt_required', 'A question prompt is required.');
    if (!Array.isArray(req.options) || req.options.length < 2) {
      throw HttpError.badRequest('too_few_options', 'A question needs at least two options.');
    }
    // Ensure every option has a stable id (fill missing ones deterministically).
    const options: RawOption[] = req.options.map((opt, i) => ({
      id: opt.id?.trim() || `o${i + 1}`,
      text: this.cleanLocalized(opt.text, 'option_text_required', 'Every option needs text.'),
    }));
    const ids = new Set(options.map((o) => o.id));
    if (ids.size !== options.length) {
      throw HttpError.badRequest('duplicate_option_id', 'Option ids must be unique.');
    }
    if (!ids.has(req.correctOptionId)) {
      throw HttpError.badRequest('invalid_correct_option', 'correctOptionId must match an option.');
    }
    const points = req.points ?? 1;
    if (points <= 0) throw HttpError.badRequest('invalid_points', 'points must be greater than zero.');

    const order = await this.repo.nextQuestionOrder(quizId);
    const row = await this.repo.addQuestion({
      quizId,
      orderIndex: order,
      prompt,
      options,
      correctOptionId: req.correctOptionId,
      points,
    });
    return this.toQuestionView(row, true, locale);
  }

  async deleteQuestion(actor: Actor, quizId: string, questionId: string): Promise<void> {
    const quiz = await this.requireQuiz(quizId);
    this.assertOwner(actor, quiz);
    const ok = await this.repo.deleteQuestion(quizId, questionId);
    if (!ok) throw HttpError.notFound('question_not_found', 'Question not found.');
  }

  async getQuiz(actor: Actor, quizId: string, locale: string): Promise<QuizView> {
    const quiz = await this.requireQuiz(quizId);
    const owner = quiz.teacherId === actor.id || isAdmin(actor.role);
    if (!owner) {
      // A taker must be an enrolled student.
      if (actor.role !== 'student' || !(await this.repo.studentEnrolledIn(actor.id, quiz.programId))) {
        throw HttpError.forbidden('not_enrolled', 'You are not enrolled in this quiz’s program.');
      }
    }
    const questions = await this.repo.listQuestions(quizId);
    const best = owner ? null : await this.repo.bestAttempt(quizId, actor.id);
    return this.toQuizView(quiz, questions, best, owner, locale);
  }

  async getQuizIdByLesson(lessonId: string): Promise<QuizByLessonResponse> {
    const quiz = await this.repo.getQuizByLesson(lessonId);
    return { quizId: quiz?.id ?? null };
  }

  async submitAttempt(
    actor: Actor,
    quizId: string,
    req: SubmitAttemptRequest,
    _locale: string,
  ): Promise<AttemptResultView> {
    const quiz = await this.requireQuiz(quizId);
    if (actor.role !== 'student') {
      throw HttpError.forbidden('students_only', 'Only a student can take a quiz.');
    }
    if (!(await this.repo.studentEnrolledIn(actor.id, quiz.programId))) {
      throw HttpError.forbidden('not_enrolled', 'You are not enrolled in this quiz’s program.');
    }
    const questions = await this.repo.listQuestions(quizId);
    if (questions.length === 0) {
      throw HttpError.badRequest('quiz_empty', 'This quiz has no questions yet.');
    }

    const answers = req.answers ?? {};
    let score = 0;
    let maxScore = 0;
    const perQuestion = questions.map((q) => {
      const points = Number(q.points);
      maxScore += points;
      const chosen = answers[q.id] ?? null;
      const correct = chosen !== null && chosen === q.correctOptionId;
      if (correct) score += points;
      return {
        questionId: q.id,
        chosenOptionId: chosen,
        correctOptionId: q.correctOptionId,
        correct,
        points,
      };
    });

    const percentage = maxScore > 0 ? round1((score / maxScore) * 100) : 0;
    const passed = percentage >= Number(quiz.passingScore);
    const attempt = await this.repo.insertAttempt({
      quizId,
      studentId: actor.id,
      answers,
      score,
      maxScore,
      percentage,
      passed,
    });

    // Passing completes the lesson → unlocks anything gated on this quiz.
    if (passed) {
      await this.repo.markLessonCompleted(actor.id, quiz.lessonId);
    }

    return {
      attemptId: attempt.id,
      score,
      maxScore,
      percentage,
      passed,
      submittedAt: attempt.submittedAt.toISOString(),
      perQuestion,
    };
  }

  async listMyAttempts(actor: Actor, quizId: string): Promise<AttemptSummary[]> {
    const quiz = await this.requireQuiz(quizId);
    if (
      actor.role !== 'student' ||
      !(await this.repo.studentEnrolledIn(actor.id, quiz.programId))
    ) {
      throw HttpError.forbidden('not_enrolled', 'You are not enrolled in this quiz’s program.');
    }
    const rows = await this.repo.listAttempts(quizId, actor.id);
    return rows.map((r) => this.toSummary(r));
  }

  // --- internals ---

  private async requireQuiz(id: string): Promise<QuizRow> {
    const quiz = await this.repo.getQuizById(id);
    if (!quiz) throw HttpError.notFound('quiz_not_found', 'Quiz not found.');
    return quiz;
  }

  private assertOwner(actor: Actor, quiz: QuizRow): void {
    if (quiz.teacherId !== actor.id) {
      throw HttpError.forbidden('not_your_quiz', 'You do not own this quiz.');
    }
  }

  private cleanLocalized(value: unknown, code: string, message: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [locale, v] of Object.entries((value ?? {}) as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim() !== '') out[locale] = v.trim();
    }
    if (Object.keys(out).length === 0) throw HttpError.badRequest(code, message);
    return out;
  }

  private toSummary(r: AttemptRow): AttemptSummary {
    return {
      score: Number(r.score),
      maxScore: Number(r.maxScore),
      percentage: Number(r.percentage),
      passed: r.passed,
      submittedAt: r.submittedAt.toISOString(),
    };
  }

  private toQuestionView(
    q: QuestionRow,
    includeAnswers: boolean,
    locale: string,
  ): QuizQuestionView {
    const options = (q.options as RawOption[]).map((o) => ({
      id: o.id,
      text: resolveLocalized(o.text, locale, this.defaultLocale),
    }));
    const view: QuizQuestionView = {
      id: q.id,
      orderIndex: q.orderIndex,
      type: q.type as QuizQuestionType,
      prompt: resolveLocalized(q.prompt, locale, this.defaultLocale),
      options,
      points: Number(q.points),
    };
    if (includeAnswers) view.correctOptionId = q.correctOptionId;
    return view;
  }

  private toQuizView(
    quiz: QuizRow,
    questions: QuestionRow[],
    best: AttemptRow | null,
    includeAnswers: boolean,
    locale: string,
  ): QuizView {
    const questionViews = questions.map((q) => this.toQuestionView(q, includeAnswers, locale));
    return {
      id: quiz.id,
      lessonId: quiz.lessonId,
      programId: quiz.programId,
      passingScore: Number(quiz.passingScore),
      timeLimitMinutes: quiz.timeLimitMinutes,
      totalPoints: questions.reduce((s, q) => s + Number(q.points), 0),
      questionCount: questions.length,
      questions: questionViews,
      bestAttempt: best ? this.toSummary(best) : null,
    };
  }
}
