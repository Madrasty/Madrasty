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
  quizzes,
  quizAttempts,
  homeworkAssignments,
  homeworkSubmissions,
  attendanceRecords,
  lessons,
  chapters,
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

// One quiz the student has attempted, reduced to their best score, tagged with
// the subject of the program the quiz belongs to (doc 10 §3.1 roll-up).
export interface QuizStatRow {
  subjectId: string;
  quizId: string;
  bestPercentage: string;
}

// How many homework assignments were SET for this student per subject — i.e.
// assignments in programs they are actively enrolled in.
export interface HomeworkAssignedRow {
  subjectId: string;
  assigned: number;
}

// One of the student's homework submissions, with the assignment's max grade so
// an absolute grade can be turned into a percentage.
export interface HomeworkSubmissionStatRow {
  subjectId: string;
  status: string;
  grade: string | null;
  maxGrade: string;
}

// One attendance row for a live class the student was expected at, with the
// subject resolved through lesson → chapter → program (doc 10 §3.4).
export interface AttendanceStatRow {
  subjectId: string;
  status: string;
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

  // Report-card roll-ups beyond exams (doc 10 §3.1). Quizzes and homework hang
  // off programs, so their subject comes from `learning_programs.subject_id`.
  // Neither carries a term, so these are all-time — see ReportCardResponse.
  listQuizStatsForStudent(studentId: string): Promise<QuizStatRow[]>;
  listHomeworkAssignedForStudent(studentId: string): Promise<HomeworkAssignedRow[]>;
  listHomeworkSubmissionsForStudent(studentId: string): Promise<HomeworkSubmissionStatRow[]>;
  // Attendance for live classes that actually ran (doc 10 §3.4). Tutoring
  // bookings (doc 13) will land in the same table under the other session type.
  listAttendanceForStudent(studentId: string): Promise<AttendanceStatRow[]>;

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

// `learning_programs.subject_id` is nullable, but a report card groups BY subject
// — a program with no subject has nowhere to go. The queries below exclude those
// rows in SQL; this narrows the type to match.
function withSubject<T extends { subjectId: string | null }>(
  rows: T[],
): Array<T & { subjectId: string }> {
  return rows.filter((r): r is T & { subjectId: string } => r.subjectId !== null);
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

  // Best attempt per quiz (retakes shouldn't drag the average down), tagged with
  // the subject of the quiz's program.
  async listQuizStatsForStudent(studentId: string): Promise<QuizStatRow[]> {
    const rows = await this.db
      .select({
        subjectId: learningPrograms.subjectId,
        quizId: quizzes.id,
        bestPercentage: sql<string>`max(${quizAttempts.percentage})`,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .innerJoin(learningPrograms, eq(quizzes.programId, learningPrograms.id))
      .where(and(eq(quizAttempts.studentId, studentId), isNotNull(learningPrograms.subjectId)))
      .groupBy(learningPrograms.subjectId, quizzes.id);
    return withSubject(rows);
  }

  // What was SET for the student: assignments in programs they're enrolled in.
  async listHomeworkAssignedForStudent(studentId: string): Promise<HomeworkAssignedRow[]> {
    const rows = await this.db
      .select({
        subjectId: learningPrograms.subjectId,
        assigned: sql<number>`count(distinct ${homeworkAssignments.id})::int`,
      })
      .from(homeworkAssignments)
      .innerJoin(learningPrograms, eq(homeworkAssignments.programId, learningPrograms.id))
      .innerJoin(
        enrollments,
        and(
          eq(enrollments.programId, homeworkAssignments.programId),
          eq(enrollments.studentId, studentId),
          eq(enrollments.status, 'active'),
        ),
      )
      .where(isNotNull(learningPrograms.subjectId))
      .groupBy(learningPrograms.subjectId);
    return withSubject(rows);
  }

  async listHomeworkSubmissionsForStudent(
    studentId: string,
  ): Promise<HomeworkSubmissionStatRow[]> {
    const rows = await this.db
      .select({
        subjectId: learningPrograms.subjectId,
        status: homeworkSubmissions.status,
        grade: homeworkSubmissions.grade,
        maxGrade: homeworkAssignments.maxGrade,
      })
      .from(homeworkSubmissions)
      .innerJoin(
        homeworkAssignments,
        eq(homeworkSubmissions.assignmentId, homeworkAssignments.id),
      )
      .innerJoin(learningPrograms, eq(homeworkAssignments.programId, learningPrograms.id))
      .where(
        and(
          eq(homeworkSubmissions.studentId, studentId),
          isNotNull(learningPrograms.subjectId),
        ),
      );
    return withSubject(rows);
  }

  // Attendance is stored polymorphically (doc 10 §4): for a live class the
  // `session_id` is the LESSON id, which is how this joins back to a subject.
  async listAttendanceForStudent(studentId: string): Promise<AttendanceStatRow[]> {
    const rows = await this.db
      .select({
        subjectId: learningPrograms.subjectId,
        status: attendanceRecords.status,
      })
      .from(attendanceRecords)
      .innerJoin(lessons, eq(lessons.id, attendanceRecords.sessionId))
      .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
      .innerJoin(learningPrograms, eq(chapters.programId, learningPrograms.id))
      .where(
        and(
          eq(attendanceRecords.studentId, studentId),
          eq(attendanceRecords.sessionType, 'live_class'),
          isNotNull(learningPrograms.subjectId),
        ),
      );
    return withSubject(rows);
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
