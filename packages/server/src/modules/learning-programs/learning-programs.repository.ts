import { and, asc, eq, isNull } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  audioLessonDetails,
  chapters,
  learningPrograms,
  lessons,
  liveLessonDetails,
  pdfLessonDetails,
  recordedLessonDetails,
} from '../../db/schema/index';
import type {
  ChapterRecord,
  LessonRecord,
  LessonStatus,
  LessonType,
  LessonVisibility,
  ProgramRecord,
  ProgramStatus,
} from './types';

export interface CreateProgramInput {
  teacherId: string;
  subjectId?: string | null;
  gradeLevel?: string | null;
  semester?: string | null;
  priceEgp?: string | null;
  metadata?: Record<string, unknown>;
}
export type UpdateProgramPatch = Partial<
  Pick<ProgramRecord, 'subjectId' | 'gradeLevel' | 'semester' | 'priceEgp' | 'status' | 'metadata'>
>;
export interface ListPublishedFilter {
  subjectId?: string;
  gradeLevel?: string;
  semester?: string;
}

export interface CreateChapterInput {
  programId: string;
  orderIndex: number;
  title?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}
export type UpdateChapterPatch = Partial<Pick<ChapterRecord, 'orderIndex' | 'title' | 'metadata'>>;

export interface CreateLessonInput {
  chapterId: string;
  orderIndex: number;
  lessonType: LessonType;
  status?: LessonStatus;
  visibility?: LessonVisibility;
  prerequisiteLessonId?: string | null;
  metadata?: Record<string, unknown>;
}
export type UpdateLessonPatch = Partial<
  Pick<LessonRecord, 'orderIndex' | 'status' | 'visibility' | 'prerequisiteLessonId' | 'metadata'>
>;

// Narrow slice the lesson-type handlers depend on, so they never see the whole
// repository (they only persist/read their own detail table).
export interface LessonDetailsStore {
  upsertDetails(type: LessonType, lessonId: string, row: Record<string, unknown>): Promise<void>;
  getDetails(type: LessonType, lessonId: string): Promise<Record<string, unknown> | null>;
}

// Data-access boundary for the whole module. The services depend on this
// interface so tests can inject an in-memory fake instead of live Postgres.
export interface LearningProgramsRepository extends LessonDetailsStore {
  createProgram(input: CreateProgramInput): Promise<ProgramRecord>;
  getProgramById(id: string): Promise<ProgramRecord | null>;
  listPublishedPrograms(filter: ListPublishedFilter): Promise<ProgramRecord[]>;
  listProgramsByTeacher(teacherId: string): Promise<ProgramRecord[]>;
  updateProgram(id: string, patch: UpdateProgramPatch): Promise<ProgramRecord | null>;
  softDeleteProgram(id: string): Promise<void>;

  createChapter(input: CreateChapterInput): Promise<ChapterRecord>;
  getChapterById(id: string): Promise<ChapterRecord | null>;
  listChaptersByProgram(programId: string): Promise<ChapterRecord[]>;
  updateChapter(id: string, patch: UpdateChapterPatch): Promise<ChapterRecord | null>;
  softDeleteChapter(id: string): Promise<void>;

  createLesson(input: CreateLessonInput): Promise<LessonRecord>;
  getLessonById(id: string): Promise<LessonRecord | null>;
  listLessonsByChapter(chapterId: string): Promise<LessonRecord[]>;
  updateLesson(id: string, patch: UpdateLessonPatch): Promise<LessonRecord | null>;
  softDeleteLesson(id: string): Promise<void>;
}

// The detail tables that actually exist as columns (doc 12 §6). The remaining
// types (quiz/homework/exam/private_session) reuse other modules' tables.
const detailTables = {
  recorded: recordedLessonDetails,
  live: liveLessonDetails,
  pdf: pdfLessonDetails,
  audio: audioLessonDetails,
} as const;

function toProgram(row: typeof learningPrograms.$inferSelect): ProgramRecord {
  return {
    id: row.id,
    teacherId: row.teacherId,
    subjectId: row.subjectId,
    gradeLevel: row.gradeLevel,
    semester: row.semester,
    priceEgp: row.priceEgp,
    status: row.status as ProgramStatus,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}
function toChapter(row: typeof chapters.$inferSelect): ChapterRecord {
  return {
    id: row.id,
    programId: row.programId,
    orderIndex: row.orderIndex,
    title: (row.title ?? null) as Record<string, unknown> | null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}
function toLesson(row: typeof lessons.$inferSelect): LessonRecord {
  return {
    id: row.id,
    chapterId: row.chapterId,
    orderIndex: row.orderIndex,
    lessonType: row.lessonType as LessonType,
    status: row.status as LessonStatus,
    visibility: row.visibility as LessonVisibility,
    prerequisiteLessonId: row.prerequisiteLessonId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

export class DrizzleLearningProgramsRepository implements LearningProgramsRepository {
  constructor(private readonly db: Database = defaultDb) {}

  // --- Programs ---
  async createProgram(input: CreateProgramInput): Promise<ProgramRecord> {
    const [row] = await this.db
      .insert(learningPrograms)
      .values({
        teacherId: input.teacherId,
        subjectId: input.subjectId ?? null,
        gradeLevel: input.gradeLevel ?? null,
        semester: input.semester ?? null,
        priceEgp: input.priceEgp ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return toProgram(row);
  }

  async getProgramById(id: string): Promise<ProgramRecord | null> {
    const rows = await this.db
      .select()
      .from(learningPrograms)
      .where(and(eq(learningPrograms.id, id), isNull(learningPrograms.deletedAt)))
      .limit(1);
    return rows[0] ? toProgram(rows[0]) : null;
  }

  async listPublishedPrograms(filter: ListPublishedFilter): Promise<ProgramRecord[]> {
    const conditions = [
      eq(learningPrograms.status, 'published'),
      isNull(learningPrograms.deletedAt),
    ];
    if (filter.subjectId) conditions.push(eq(learningPrograms.subjectId, filter.subjectId));
    if (filter.gradeLevel) conditions.push(eq(learningPrograms.gradeLevel, filter.gradeLevel));
    if (filter.semester) conditions.push(eq(learningPrograms.semester, filter.semester));
    const rows = await this.db
      .select()
      .from(learningPrograms)
      .where(and(...conditions))
      .orderBy(asc(learningPrograms.createdAt));
    return rows.map(toProgram);
  }

  async listProgramsByTeacher(teacherId: string): Promise<ProgramRecord[]> {
    const rows = await this.db
      .select()
      .from(learningPrograms)
      .where(and(eq(learningPrograms.teacherId, teacherId), isNull(learningPrograms.deletedAt)))
      .orderBy(asc(learningPrograms.createdAt));
    return rows.map(toProgram);
  }

  async updateProgram(id: string, patch: UpdateProgramPatch): Promise<ProgramRecord | null> {
    const [row] = await this.db
      .update(learningPrograms)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(learningPrograms.id, id), isNull(learningPrograms.deletedAt)))
      .returning();
    return row ? toProgram(row) : null;
  }

  async softDeleteProgram(id: string): Promise<void> {
    await this.db
      .update(learningPrograms)
      .set({ deletedAt: new Date() })
      .where(eq(learningPrograms.id, id));
  }

  // --- Chapters ---
  async createChapter(input: CreateChapterInput): Promise<ChapterRecord> {
    const [row] = await this.db
      .insert(chapters)
      .values({
        programId: input.programId,
        orderIndex: input.orderIndex,
        title: input.title ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return toChapter(row);
  }

  async getChapterById(id: string): Promise<ChapterRecord | null> {
    const rows = await this.db
      .select()
      .from(chapters)
      .where(and(eq(chapters.id, id), isNull(chapters.deletedAt)))
      .limit(1);
    return rows[0] ? toChapter(rows[0]) : null;
  }

  async listChaptersByProgram(programId: string): Promise<ChapterRecord[]> {
    const rows = await this.db
      .select()
      .from(chapters)
      .where(and(eq(chapters.programId, programId), isNull(chapters.deletedAt)))
      .orderBy(asc(chapters.orderIndex));
    return rows.map(toChapter);
  }

  async updateChapter(id: string, patch: UpdateChapterPatch): Promise<ChapterRecord | null> {
    const [row] = await this.db
      .update(chapters)
      .set(patch)
      .where(and(eq(chapters.id, id), isNull(chapters.deletedAt)))
      .returning();
    return row ? toChapter(row) : null;
  }

  async softDeleteChapter(id: string): Promise<void> {
    await this.db.update(chapters).set({ deletedAt: new Date() }).where(eq(chapters.id, id));
  }

  // --- Lessons ---
  async createLesson(input: CreateLessonInput): Promise<LessonRecord> {
    const [row] = await this.db
      .insert(lessons)
      .values({
        chapterId: input.chapterId,
        orderIndex: input.orderIndex,
        lessonType: input.lessonType,
        status: input.status ?? 'draft',
        visibility: input.visibility ?? 'paid',
        prerequisiteLessonId: input.prerequisiteLessonId ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return toLesson(row);
  }

  async getLessonById(id: string): Promise<LessonRecord | null> {
    const rows = await this.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.id, id), isNull(lessons.deletedAt)))
      .limit(1);
    return rows[0] ? toLesson(rows[0]) : null;
  }

  async listLessonsByChapter(chapterId: string): Promise<LessonRecord[]> {
    const rows = await this.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.chapterId, chapterId), isNull(lessons.deletedAt)))
      .orderBy(asc(lessons.orderIndex));
    return rows.map(toLesson);
  }

  async updateLesson(id: string, patch: UpdateLessonPatch): Promise<LessonRecord | null> {
    const [row] = await this.db
      .update(lessons)
      .set(patch)
      .where(and(eq(lessons.id, id), isNull(lessons.deletedAt)))
      .returning();
    return row ? toLesson(row) : null;
  }

  async softDeleteLesson(id: string): Promise<void> {
    await this.db.update(lessons).set({ deletedAt: new Date() }).where(eq(lessons.id, id));
  }

  // --- Lesson detail tables ---
  async upsertDetails(
    type: LessonType,
    lessonId: string,
    row: Record<string, unknown>,
  ): Promise<void> {
    const table = detailTables[type as keyof typeof detailTables];
    if (!table) return; // quiz/homework/exam/private_session have no detail table here
    await this.db
      .insert(table)
      .values({ lessonId, ...row } as typeof table.$inferInsert)
      .onConflictDoUpdate({
        target: table.lessonId,
        set: row as Partial<typeof table.$inferInsert>,
      });
  }

  async getDetails(type: LessonType, lessonId: string): Promise<Record<string, unknown> | null> {
    const table = detailTables[type as keyof typeof detailTables];
    if (!table) return null;
    const rows = await this.db.select().from(table).where(eq(table.lessonId, lessonId)).limit(1);
    return rows[0] ? (rows[0] as Record<string, unknown>) : null;
  }
}
