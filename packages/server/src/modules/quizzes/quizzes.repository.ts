import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  quizzes,
  quizQuestions,
  quizAttempts,
  lessons,
  chapters,
  learningPrograms,
  enrollments,
  lessonProgress,
} from '../../db/schema/index';

export interface QuizRow {
  id: string;
  lessonId: string;
  programId: string;
  teacherId: string;
  passingScore: string;
  timeLimitMinutes: number | null;
  generatedBy: string;
  createdAt: Date;
}

export interface QuestionRow {
  id: string;
  quizId: string;
  orderIndex: number;
  type: string;
  prompt: unknown;
  options: unknown;
  correctOptionId: string;
  points: string;
}

export interface AttemptRow {
  id: string;
  quizId: string;
  studentId: string;
  answers: unknown;
  score: string;
  maxScore: string;
  percentage: string;
  passed: boolean;
  submittedAt: Date;
}

export interface LessonInfo {
  lessonType: string;
  programId: string;
}

export interface NewQuestion {
  quizId: string;
  orderIndex: number;
  prompt: Record<string, string>;
  options: Array<{ id: string; text: Record<string, string> }>;
  correctOptionId: string;
  points: number;
}

export interface NewAttempt {
  quizId: string;
  studentId: string;
  answers: Record<string, string>;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
}

export interface QuizzesRepository {
  resolveLessonInfo(lessonId: string): Promise<LessonInfo | null>;
  teacherOwnsProgram(teacherId: string, programId: string): Promise<boolean>;
  studentEnrolledIn(studentId: string, programId: string): Promise<boolean>;

  getQuizById(id: string): Promise<QuizRow | null>;
  getQuizByLesson(lessonId: string): Promise<QuizRow | null>;
  createQuiz(input: {
    lessonId: string;
    programId: string;
    teacherId: string;
    passingScore: number;
    timeLimitMinutes: number | null;
  }): Promise<QuizRow>;

  listQuestions(quizId: string): Promise<QuestionRow[]>;
  nextQuestionOrder(quizId: string): Promise<number>;
  addQuestion(input: NewQuestion): Promise<QuestionRow>;
  deleteQuestion(quizId: string, questionId: string): Promise<boolean>;

  insertAttempt(input: NewAttempt): Promise<AttemptRow>;
  bestAttempt(quizId: string, studentId: string): Promise<AttemptRow | null>;
  listAttempts(quizId: string, studentId: string): Promise<AttemptRow[]>;

  // Completing the quiz's lesson is what powers "Locked until Quiz Passed"
  // gating (doc 12 §5). Idempotent upsert on the (student, lesson) pair.
  markLessonCompleted(studentId: string, lessonId: string): Promise<void>;
}

const quizColumns = {
  id: quizzes.id,
  lessonId: quizzes.lessonId,
  programId: quizzes.programId,
  teacherId: quizzes.teacherId,
  passingScore: quizzes.passingScore,
  timeLimitMinutes: quizzes.timeLimitMinutes,
  generatedBy: quizzes.generatedBy,
  createdAt: quizzes.createdAt,
};

const questionColumns = {
  id: quizQuestions.id,
  quizId: quizQuestions.quizId,
  orderIndex: quizQuestions.orderIndex,
  type: quizQuestions.type,
  prompt: quizQuestions.prompt,
  options: quizQuestions.options,
  correctOptionId: quizQuestions.correctOptionId,
  points: quizQuestions.points,
};

const attemptColumns = {
  id: quizAttempts.id,
  quizId: quizAttempts.quizId,
  studentId: quizAttempts.studentId,
  answers: quizAttempts.answers,
  score: quizAttempts.score,
  maxScore: quizAttempts.maxScore,
  percentage: quizAttempts.percentage,
  passed: quizAttempts.passed,
  submittedAt: quizAttempts.submittedAt,
};

export class DrizzleQuizzesRepository implements QuizzesRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async resolveLessonInfo(lessonId: string): Promise<LessonInfo | null> {
    const rows = await this.db
      .select({ lessonType: lessons.lessonType, programId: chapters.programId })
      .from(lessons)
      .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
      .where(eq(lessons.id, lessonId))
      .limit(1);
    return rows[0] ?? null;
  }

  async teacherOwnsProgram(teacherId: string, programId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: learningPrograms.id })
      .from(learningPrograms)
      .where(and(eq(learningPrograms.id, programId), eq(learningPrograms.teacherId, teacherId)))
      .limit(1);
    return rows.length > 0;
  }

  async studentEnrolledIn(studentId: string, programId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, studentId),
          eq(enrollments.programId, programId),
          eq(enrollments.status, 'active'),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async getQuizById(id: string): Promise<QuizRow | null> {
    const rows = await this.db.select(quizColumns).from(quizzes).where(eq(quizzes.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async getQuizByLesson(lessonId: string): Promise<QuizRow | null> {
    const rows = await this.db
      .select(quizColumns)
      .from(quizzes)
      .where(eq(quizzes.lessonId, lessonId))
      .limit(1);
    return rows[0] ?? null;
  }

  async createQuiz(input: {
    lessonId: string;
    programId: string;
    teacherId: string;
    passingScore: number;
    timeLimitMinutes: number | null;
  }): Promise<QuizRow> {
    const [row] = await this.db
      .insert(quizzes)
      .values({
        lessonId: input.lessonId,
        programId: input.programId,
        teacherId: input.teacherId,
        passingScore: String(input.passingScore),
        timeLimitMinutes: input.timeLimitMinutes,
      })
      .returning(quizColumns);
    return row;
  }

  async listQuestions(quizId: string): Promise<QuestionRow[]> {
    return this.db
      .select(questionColumns)
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.orderIndex));
  }

  async nextQuestionOrder(quizId: string): Promise<number> {
    const rows = await this.db
      .select({ max: sql<number>`coalesce(max(${quizQuestions.orderIndex}), -1)` })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));
    return (rows[0]?.max ?? -1) + 1;
  }

  async addQuestion(input: NewQuestion): Promise<QuestionRow> {
    const [row] = await this.db
      .insert(quizQuestions)
      .values({
        quizId: input.quizId,
        orderIndex: input.orderIndex,
        prompt: input.prompt,
        options: input.options,
        correctOptionId: input.correctOptionId,
        points: String(input.points),
      })
      .returning(questionColumns);
    return row;
  }

  async deleteQuestion(quizId: string, questionId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(quizQuestions)
      .where(and(eq(quizQuestions.id, questionId), eq(quizQuestions.quizId, quizId)))
      .returning({ id: quizQuestions.id });
    return deleted.length > 0;
  }

  async insertAttempt(input: NewAttempt): Promise<AttemptRow> {
    const [row] = await this.db
      .insert(quizAttempts)
      .values({
        quizId: input.quizId,
        studentId: input.studentId,
        answers: input.answers,
        score: String(input.score),
        maxScore: String(input.maxScore),
        percentage: String(input.percentage),
        passed: input.passed,
      })
      .returning(attemptColumns);
    return row;
  }

  async bestAttempt(quizId: string, studentId: string): Promise<AttemptRow | null> {
    const rows = await this.db
      .select(attemptColumns)
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.studentId, studentId)))
      .orderBy(desc(quizAttempts.percentage), desc(quizAttempts.submittedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async listAttempts(quizId: string, studentId: string): Promise<AttemptRow[]> {
    return this.db
      .select(attemptColumns)
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.studentId, studentId)))
      .orderBy(desc(quizAttempts.submittedAt));
  }

  async markLessonCompleted(studentId: string, lessonId: string): Promise<void> {
    await this.db
      .insert(lessonProgress)
      .values({ studentId, lessonId, completedAt: new Date() })
      .onConflictDoUpdate({
        target: [lessonProgress.studentId, lessonProgress.lessonId],
        set: { completedAt: new Date() },
      });
  }
}
