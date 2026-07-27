import { and, asc, eq, sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  homeworkAssignments,
  homeworkSubmissions,
  lessons,
  chapters,
  learningPrograms,
  enrollments,
  lessonProgress,
  users,
} from '../../db/schema/index';

export interface AssignmentRow {
  id: string;
  lessonId: string;
  programId: string;
  teacherId: string;
  brief: unknown;
  maxGrade: string;
  dueAt: Date | null;
  allowLate: boolean;
  createdAt: Date;
}

export interface SubmissionRow {
  id: string;
  assignmentId: string;
  studentId: string;
  content: string;
  status: string;
  grade: string | null;
  teacherComment: string | null;
  gradedBy: string | null;
  gradedAt: Date | null;
  submittedAt: Date;
}

export interface LessonInfo {
  lessonType: string;
  programId: string;
}

export interface UserBrief {
  id: string;
  fullName: string | null;
}

export interface NewAssignment {
  lessonId: string;
  programId: string;
  teacherId: string;
  brief: Record<string, string>;
  maxGrade: number;
  dueAt: Date | null;
  allowLate: boolean;
}

export interface AssignmentPatch {
  brief?: Record<string, string>;
  maxGrade?: number;
  dueAt?: Date | null;
  allowLate?: boolean;
}

export interface SubmissionUpsert {
  assignmentId: string;
  studentId: string;
  content: string;
  status: string;
}

export interface GradePatch {
  grade: number;
  teacherComment: string | null;
  graderId: string;
}

export interface HomeworkRepository {
  resolveLessonInfo(lessonId: string): Promise<LessonInfo | null>;
  teacherOwnsProgram(teacherId: string, programId: string): Promise<boolean>;
  studentEnrolledIn(studentId: string, programId: string): Promise<boolean>;
  listEnrolledStudents(programId: string): Promise<UserBrief[]>;

  getAssignmentById(id: string): Promise<AssignmentRow | null>;
  getAssignmentByLesson(lessonId: string): Promise<AssignmentRow | null>;
  createAssignment(input: NewAssignment): Promise<AssignmentRow>;
  updateAssignment(id: string, patch: AssignmentPatch): Promise<AssignmentRow | null>;

  getSubmission(assignmentId: string, studentId: string): Promise<SubmissionRow | null>;
  getSubmissionById(id: string): Promise<SubmissionRow | null>;
  upsertSubmission(input: SubmissionUpsert): Promise<SubmissionRow>;
  listSubmissions(assignmentId: string): Promise<SubmissionRow[]>;
  countSubmissions(assignmentId: string): Promise<{ total: number; pending: number }>;
  gradeSubmission(id: string, patch: GradePatch): Promise<SubmissionRow | null>;

  // Submitting completes the homework lesson → unlocks anything gated on it
  // (doc 12 §5). Idempotent upsert on the (student, lesson) pair.
  markLessonCompleted(studentId: string, lessonId: string): Promise<void>;
}

const assignmentColumns = {
  id: homeworkAssignments.id,
  lessonId: homeworkAssignments.lessonId,
  programId: homeworkAssignments.programId,
  teacherId: homeworkAssignments.teacherId,
  brief: homeworkAssignments.brief,
  maxGrade: homeworkAssignments.maxGrade,
  dueAt: homeworkAssignments.dueAt,
  allowLate: homeworkAssignments.allowLate,
  createdAt: homeworkAssignments.createdAt,
};

const submissionColumns = {
  id: homeworkSubmissions.id,
  assignmentId: homeworkSubmissions.assignmentId,
  studentId: homeworkSubmissions.studentId,
  content: homeworkSubmissions.content,
  status: homeworkSubmissions.status,
  grade: homeworkSubmissions.grade,
  teacherComment: homeworkSubmissions.teacherComment,
  gradedBy: homeworkSubmissions.gradedBy,
  gradedAt: homeworkSubmissions.gradedAt,
  submittedAt: homeworkSubmissions.submittedAt,
};

// `full_name` lives in users.metadata (see the auth module's registration flow).
function fullNameOf(metadata: unknown): string | null {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const value = meta.fullName ?? meta.full_name;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export class DrizzleHomeworkRepository implements HomeworkRepository {
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

  async listEnrolledStudents(programId: string): Promise<UserBrief[]> {
    const rows = await this.db
      .selectDistinct({ id: users.id, metadata: users.metadata })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .where(and(eq(enrollments.programId, programId), eq(enrollments.status, 'active')));
    return rows.map((r) => ({ id: r.id, fullName: fullNameOf(r.metadata) }));
  }

  async getAssignmentById(id: string): Promise<AssignmentRow | null> {
    const rows = await this.db
      .select(assignmentColumns)
      .from(homeworkAssignments)
      .where(eq(homeworkAssignments.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async getAssignmentByLesson(lessonId: string): Promise<AssignmentRow | null> {
    const rows = await this.db
      .select(assignmentColumns)
      .from(homeworkAssignments)
      .where(eq(homeworkAssignments.lessonId, lessonId))
      .limit(1);
    return rows[0] ?? null;
  }

  async createAssignment(input: NewAssignment): Promise<AssignmentRow> {
    const [row] = await this.db
      .insert(homeworkAssignments)
      .values({
        lessonId: input.lessonId,
        programId: input.programId,
        teacherId: input.teacherId,
        brief: input.brief,
        maxGrade: String(input.maxGrade),
        dueAt: input.dueAt,
        allowLate: input.allowLate,
      })
      .returning(assignmentColumns);
    return row;
  }

  async updateAssignment(id: string, patch: AssignmentPatch): Promise<AssignmentRow | null> {
    const values: Record<string, unknown> = {};
    if (patch.brief !== undefined) values.brief = patch.brief;
    if (patch.maxGrade !== undefined) values.maxGrade = String(patch.maxGrade);
    if (patch.dueAt !== undefined) values.dueAt = patch.dueAt;
    if (patch.allowLate !== undefined) values.allowLate = patch.allowLate;
    if (Object.keys(values).length === 0) return this.getAssignmentById(id);

    const rows = await this.db
      .update(homeworkAssignments)
      .set(values)
      .where(eq(homeworkAssignments.id, id))
      .returning(assignmentColumns);
    return rows[0] ?? null;
  }

  async getSubmission(assignmentId: string, studentId: string): Promise<SubmissionRow | null> {
    const rows = await this.db
      .select(submissionColumns)
      .from(homeworkSubmissions)
      .where(
        and(
          eq(homeworkSubmissions.assignmentId, assignmentId),
          eq(homeworkSubmissions.studentId, studentId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async getSubmissionById(id: string): Promise<SubmissionRow | null> {
    const rows = await this.db
      .select(submissionColumns)
      .from(homeworkSubmissions)
      .where(eq(homeworkSubmissions.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertSubmission(input: SubmissionUpsert): Promise<SubmissionRow> {
    const [row] = await this.db
      .insert(homeworkSubmissions)
      .values({
        assignmentId: input.assignmentId,
        studentId: input.studentId,
        content: input.content,
        status: input.status,
        submittedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [homeworkSubmissions.assignmentId, homeworkSubmissions.studentId],
        set: { content: input.content, status: input.status, submittedAt: new Date() },
      })
      .returning(submissionColumns);
    return row;
  }

  async listSubmissions(assignmentId: string): Promise<SubmissionRow[]> {
    return this.db
      .select(submissionColumns)
      .from(homeworkSubmissions)
      .where(eq(homeworkSubmissions.assignmentId, assignmentId))
      .orderBy(asc(homeworkSubmissions.submittedAt));
  }

  async countSubmissions(assignmentId: string): Promise<{ total: number; pending: number }> {
    const rows = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${homeworkSubmissions.status} <> 'graded')::int`,
      })
      .from(homeworkSubmissions)
      .where(eq(homeworkSubmissions.assignmentId, assignmentId));
    return { total: rows[0]?.total ?? 0, pending: rows[0]?.pending ?? 0 };
  }

  async gradeSubmission(id: string, patch: GradePatch): Promise<SubmissionRow | null> {
    const rows = await this.db
      .update(homeworkSubmissions)
      .set({
        grade: String(patch.grade),
        teacherComment: patch.teacherComment,
        status: 'graded',
        gradedBy: 'teacher',
        graderId: patch.graderId,
        gradedAt: new Date(),
      })
      .where(eq(homeworkSubmissions.id, id))
      .returning(submissionColumns);
    return rows[0] ?? null;
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
