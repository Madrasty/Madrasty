import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  attendanceRecords,
  chapters,
  enrollments,
  learningPrograms,
  lessons,
  liveLessonDetails,
  parentChildren,
  translations,
  users,
} from '../../db/schema/index';

// A live lesson joined with its detail row — the whole "session" in one shape.
export interface LiveLessonRow {
  lessonId: string;
  chapterId: string;
  programId: string;
  teacherId: string;
  lessonStatus: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  meetingUrl: string | null;
  recordingUrl: string | null;
  channelName: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface AttendanceRow {
  id: string;
  studentId: string;
  sessionType: string;
  sessionId: string;
  status: string;
  recordedBy: string | null;
  metadata: unknown;
  recordedAt: Date;
}

export interface UserBrief {
  id: string;
  fullName: string | null;
}

export interface StudentGate {
  active: boolean;
  guardianApproved: boolean;
}

export interface RuntimePatch {
  channelName?: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
}

export interface AttendanceUpsert {
  sessionId: string;
  studentId: string;
  status: string;
  recordedBy?: string | null;
  metadata: Record<string, unknown>;
}

export interface TranslationRow {
  entityType: string;
  entityId: string;
  locale: string;
  field: string;
  value: string;
}

export interface LiveClassesRepository {
  getLiveLesson(lessonId: string): Promise<LiveLessonRow | null>;
  listTranslations(entityType: string, entityIds: string[]): Promise<TranslationRow[]>;
  // Every live lesson of the programs a student is actively enrolled in.
  listForStudent(studentId: string): Promise<LiveLessonRow[]>;
  // Every live lesson across a teacher's own programs.
  listForTeacher(teacherId: string): Promise<LiveLessonRow[]>;
  updateRuntime(lessonId: string, patch: RuntimePatch): Promise<void>;
  markAttendanceTaken(lessonId: string): Promise<void>;

  getStudentGate(studentId: string): Promise<StudentGate>;
  studentEnrolledIn(studentId: string, programId: string): Promise<boolean>;
  listEnrolledStudents(programId: string): Promise<UserBrief[]>;

  getAttendance(sessionId: string, studentId: string): Promise<AttendanceRow | null>;
  listAttendance(sessionId: string): Promise<AttendanceRow[]>;
  upsertAttendance(input: AttendanceUpsert): Promise<AttendanceRow>;
}

// Attendance rows written by this module are all live-class rows; tutoring
// bookings (doc 13) will write the same table with the other session type.
export const LIVE_CLASS_SESSION_TYPE = 'live_class';

const liveLessonColumns = {
  lessonId: lessons.id,
  chapterId: lessons.chapterId,
  programId: chapters.programId,
  teacherId: learningPrograms.teacherId,
  lessonStatus: lessons.status,
  scheduledStart: liveLessonDetails.scheduledStart,
  scheduledEnd: liveLessonDetails.scheduledEnd,
  meetingUrl: liveLessonDetails.meetingUrl,
  recordingUrl: liveLessonDetails.recordingUrl,
  channelName: liveLessonDetails.channelName,
  startedAt: liveLessonDetails.startedAt,
  endedAt: liveLessonDetails.endedAt,
};

const attendanceColumns = {
  id: attendanceRecords.id,
  studentId: attendanceRecords.studentId,
  sessionType: attendanceRecords.sessionType,
  sessionId: attendanceRecords.sessionId,
  status: attendanceRecords.status,
  recordedBy: attendanceRecords.recordedBy,
  metadata: attendanceRecords.metadata,
  recordedAt: attendanceRecords.recordedAt,
};

export class DrizzleLiveClassesRepository implements LiveClassesRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async getLiveLesson(lessonId: string): Promise<LiveLessonRow | null> {
    const rows = await this.db
      .select(liveLessonColumns)
      .from(lessons)
      .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
      .innerJoin(learningPrograms, eq(chapters.programId, learningPrograms.id))
      .leftJoin(liveLessonDetails, eq(liveLessonDetails.lessonId, lessons.id))
      .where(and(eq(lessons.id, lessonId), eq(lessons.lessonType, 'live')))
      .limit(1);
    return rows[0] ?? null;
  }

  async listTranslations(entityType: string, entityIds: string[]): Promise<TranslationRow[]> {
    if (entityIds.length === 0) return [];
    return this.db
      .select({
        entityType: translations.entityType,
        entityId: translations.entityId,
        locale: translations.locale,
        field: translations.field,
        value: translations.value,
      })
      .from(translations)
      .where(
        and(eq(translations.entityType, entityType), inArray(translations.entityId, entityIds)),
      );
  }

  async listForStudent(studentId: string): Promise<LiveLessonRow[]> {
    return this.db
      .select(liveLessonColumns)
      .from(lessons)
      .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
      .innerJoin(learningPrograms, eq(chapters.programId, learningPrograms.id))
      .innerJoin(enrollments, eq(enrollments.programId, chapters.programId))
      .leftJoin(liveLessonDetails, eq(liveLessonDetails.lessonId, lessons.id))
      .where(
        and(
          eq(lessons.lessonType, 'live'),
          eq(enrollments.studentId, studentId),
          eq(enrollments.status, 'active'),
        ),
      )
      .orderBy(asc(liveLessonDetails.scheduledStart));
  }

  async listForTeacher(teacherId: string): Promise<LiveLessonRow[]> {
    return this.db
      .select(liveLessonColumns)
      .from(lessons)
      .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
      .innerJoin(learningPrograms, eq(chapters.programId, learningPrograms.id))
      .leftJoin(liveLessonDetails, eq(liveLessonDetails.lessonId, lessons.id))
      .where(and(eq(lessons.lessonType, 'live'), eq(learningPrograms.teacherId, teacherId)))
      .orderBy(asc(liveLessonDetails.scheduledStart));
  }

  // The detail row may not exist yet if the teacher never filled the schedule
  // form, so this is an upsert rather than an update.
  async updateRuntime(lessonId: string, patch: RuntimePatch): Promise<void> {
    await this.db
      .insert(liveLessonDetails)
      .values({ lessonId, ...patch })
      .onConflictDoUpdate({ target: liveLessonDetails.lessonId, set: patch });
  }

  async markAttendanceTaken(lessonId: string): Promise<void> {
    await this.db
      .insert(liveLessonDetails)
      .values({ lessonId, attendanceTaken: true })
      .onConflictDoUpdate({
        target: liveLessonDetails.lessonId,
        set: { attendanceTaken: true },
      });
  }

  async getStudentGate(studentId: string): Promise<StudentGate> {
    const [account] = await this.db
      .select({ status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);

    const guardian = await this.db
      .select({ studentId: parentChildren.studentId })
      .from(parentChildren)
      .where(and(eq(parentChildren.studentId, studentId), isNotNull(parentChildren.approvedAt)))
      .limit(1);

    return {
      active: account?.status === 'active' && account.deletedAt === null,
      guardianApproved: guardian.length > 0,
    };
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
    return rows.map((row) => ({
      id: row.id,
      fullName: ((row.metadata ?? {}) as { fullName?: string }).fullName ?? null,
    }));
  }

  async getAttendance(sessionId: string, studentId: string): Promise<AttendanceRow | null> {
    const rows = await this.db
      .select(attendanceColumns)
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.sessionType, LIVE_CLASS_SESSION_TYPE),
          eq(attendanceRecords.sessionId, sessionId),
          eq(attendanceRecords.studentId, studentId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listAttendance(sessionId: string): Promise<AttendanceRow[]> {
    return this.db
      .select(attendanceColumns)
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.sessionType, LIVE_CLASS_SESSION_TYPE),
          eq(attendanceRecords.sessionId, sessionId),
        ),
      );
  }

  // One row per (session, student) — a rejoin or a teacher override updates the
  // same row rather than stacking conflicting ones.
  async upsertAttendance(input: AttendanceUpsert): Promise<AttendanceRow> {
    const values = {
      sessionType: LIVE_CLASS_SESSION_TYPE,
      sessionId: input.sessionId,
      studentId: input.studentId,
      status: input.status,
      recordedBy: input.recordedBy ?? null,
      metadata: input.metadata,
      recordedAt: new Date(),
    };
    const [row] = await this.db
      .insert(attendanceRecords)
      .values(values)
      .onConflictDoUpdate({
        target: [
          attendanceRecords.sessionType,
          attendanceRecords.sessionId,
          attendanceRecords.studentId,
        ],
        set: {
          status: values.status,
          recordedBy: values.recordedBy,
          metadata: values.metadata,
          recordedAt: values.recordedAt,
        },
      })
      .returning(attendanceColumns);
    return row;
  }
}
