import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  exams,
  examResults,
  users,
  subjects,
  learningPrograms,
  translations,
  enrollments,
  parentChildren,
} from '../../db/schema/index';

export interface ExamRow {
  id: string;
  teacherId: string;
  subjectId: string;
  programId: string | null;
  title: unknown; // jsonb { ar, en }
  maxScore: string;
  weight: string;
  term: string | null;
  createdAt: Date;
}

export interface ResultRow {
  id: string;
  examId: string;
  studentId: string;
  score: string;
  teacherComment: string | null;
  gradedBy: string;
  gradedAt: Date;
}

// A student's result joined with the exam it belongs to — the report-card source.
export interface StudentResultRow {
  examId: string;
  subjectId: string;
  title: unknown;
  maxScore: string;
  weight: string;
  term: string | null;
  score: string;
  teacherComment: string | null;
  gradedAt: Date;
}

export interface UserBrief {
  id: string;
  fullName: string | null;
}

export interface SubjectTranslationRow {
  entityId: string;
  locale: string;
  field: string;
  value: string;
}

export interface CreateExamInput {
  teacherId: string;
  subjectId: string;
  programId: string | null;
  title: Record<string, string>;
  maxScore: number;
  weight: number;
  term: string | null;
}

export interface AcademicRecordsRepository {
  createExam(input: CreateExamInput): Promise<ExamRow>;
  getExamById(id: string): Promise<ExamRow | null>;
  listExamsByTeacher(teacherId: string): Promise<ExamRow[]>;
  teacherOwnsProgram(teacherId: string, programId: string): Promise<boolean>;
  subjectExists(subjectId: string): Promise<boolean>;

  upsertResult(
    examId: string,
    studentId: string,
    score: number,
    comment: string | null,
    gradedBy: string,
  ): Promise<ResultRow>;
  listResultsForExam(examId: string): Promise<ResultRow[]>;
  listResultsForStudent(studentId: string, term?: string): Promise<StudentResultRow[]>;
  listEnrolledStudents(programId: string): Promise<UserBrief[]>;

  isApprovedParentOf(parentId: string, studentId: string): Promise<boolean>;
  getUsersBrief(ids: string[]): Promise<UserBrief[]>;
  getSubjectSlugs(ids: string[]): Promise<Array<{ id: string; slug: string | null }>>;
  getSubjectTranslations(ids: string[]): Promise<SubjectTranslationRow[]>;
}

const examColumns = {
  id: exams.id,
  teacherId: exams.teacherId,
  subjectId: exams.subjectId,
  programId: exams.programId,
  title: exams.title,
  maxScore: exams.maxScore,
  weight: exams.weight,
  term: exams.term,
  createdAt: exams.createdAt,
};

const resultColumns = {
  id: examResults.id,
  examId: examResults.examId,
  studentId: examResults.studentId,
  score: examResults.score,
  teacherComment: examResults.teacherComment,
  gradedBy: examResults.gradedBy,
  gradedAt: examResults.gradedAt,
};

function fullNameOf(metadata: unknown): string | null {
  return (metadata as { fullName?: string } | null)?.fullName ?? null;
}

export class DrizzleAcademicRecordsRepository implements AcademicRecordsRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async createExam(input: CreateExamInput): Promise<ExamRow> {
    const [row] = await this.db
      .insert(exams)
      .values({
        teacherId: input.teacherId,
        subjectId: input.subjectId,
        programId: input.programId,
        title: input.title,
        maxScore: String(input.maxScore),
        weight: String(input.weight),
        term: input.term,
      })
      .returning(examColumns);
    return row;
  }

  async getExamById(id: string): Promise<ExamRow | null> {
    const rows = await this.db.select(examColumns).from(exams).where(eq(exams.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async listExamsByTeacher(teacherId: string): Promise<ExamRow[]> {
    return this.db
      .select(examColumns)
      .from(exams)
      .where(eq(exams.teacherId, teacherId))
      .orderBy(sql`${exams.createdAt} DESC`);
  }

  async teacherOwnsProgram(teacherId: string, programId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: learningPrograms.id })
      .from(learningPrograms)
      .where(and(eq(learningPrograms.id, programId), eq(learningPrograms.teacherId, teacherId)))
      .limit(1);
    return rows.length > 0;
  }

  async subjectExists(subjectId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);
    return rows.length > 0;
  }

  async upsertResult(
    examId: string,
    studentId: string,
    score: number,
    comment: string | null,
    gradedBy: string,
  ): Promise<ResultRow> {
    const [row] = await this.db
      .insert(examResults)
      .values({ examId, studentId, score: String(score), teacherComment: comment, gradedBy })
      .onConflictDoUpdate({
        target: [examResults.examId, examResults.studentId],
        set: {
          score: String(score),
          teacherComment: comment,
          gradedBy,
          gradedAt: new Date(),
        },
      })
      .returning(resultColumns);
    return row;
  }

  async listResultsForExam(examId: string): Promise<ResultRow[]> {
    return this.db.select(resultColumns).from(examResults).where(eq(examResults.examId, examId));
  }

  async listResultsForStudent(studentId: string, term?: string): Promise<StudentResultRow[]> {
    const where = term
      ? and(eq(examResults.studentId, studentId), eq(exams.term, term))
      : eq(examResults.studentId, studentId);
    return this.db
      .select({
        examId: exams.id,
        subjectId: exams.subjectId,
        title: exams.title,
        maxScore: exams.maxScore,
        weight: exams.weight,
        term: exams.term,
        score: examResults.score,
        teacherComment: examResults.teacherComment,
        gradedAt: examResults.gradedAt,
      })
      .from(examResults)
      .innerJoin(exams, eq(examResults.examId, exams.id))
      .where(where)
      .orderBy(sql`${examResults.gradedAt} DESC`);
  }

  async listEnrolledStudents(programId: string): Promise<UserBrief[]> {
    const rows = await this.db
      .selectDistinct({ id: users.id, metadata: users.metadata })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .where(and(eq(enrollments.programId, programId), eq(enrollments.status, 'active')));
    return rows.map((r) => ({ id: r.id, fullName: fullNameOf(r.metadata) }));
  }

  async isApprovedParentOf(parentId: string, studentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ studentId: parentChildren.studentId })
      .from(parentChildren)
      .where(
        and(
          eq(parentChildren.parentId, parentId),
          eq(parentChildren.studentId, studentId),
          isNotNull(parentChildren.approvedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async getUsersBrief(ids: string[]): Promise<UserBrief[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: users.id, metadata: users.metadata })
      .from(users)
      .where(inArray(users.id, ids));
    return rows.map((r) => ({ id: r.id, fullName: fullNameOf(r.metadata) }));
  }

  async getSubjectSlugs(ids: string[]): Promise<Array<{ id: string; slug: string | null }>> {
    if (ids.length === 0) return [];
    return this.db
      .select({ id: subjects.id, slug: subjects.slug })
      .from(subjects)
      .where(inArray(subjects.id, ids));
  }

  async getSubjectTranslations(ids: string[]): Promise<SubjectTranslationRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        entityId: translations.entityId,
        locale: translations.locale,
        field: translations.field,
        value: translations.value,
      })
      .from(translations)
      .where(and(eq(translations.entityType, 'subject'), inArray(translations.entityId, ids)));
  }
}
