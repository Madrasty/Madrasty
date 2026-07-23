import { config } from '../../config/index';
import type {
  LearningProgramsRepository,
  UpdateLessonPatch,
} from './learning-programs.repository';
import { getHandler, type LessonHandlerRegistry } from './lesson-types/handler';
import { loadChapterInProgram, loadEditableProgram, loadLessonInChapter } from './guards';
import { LESSON_ENTITY, resolveLocalizedText, writeLocalizedFields } from './localized';
import type { Actor, LessonRecord } from './types';
import type { CreateLessonBody, UpdateLessonBody } from './learning-programs.schemas';

export interface LessonWithDetails {
  lesson: LessonRecord;
  // Resolved for the request locale from the translations table (doc 12 §6).
  title: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
}

// Shared lesson CRUD (order, status, visibility). Type-specific persistence is
// delegated to the matching handler — this service never branches on lesson_type.
export class LessonsService {
  constructor(
    private readonly repo: LearningProgramsRepository,
    private readonly handlers: LessonHandlerRegistry,
  ) {}

  async create(
    actor: Actor,
    programId: string,
    chapterId: string,
    body: CreateLessonBody,
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<LessonWithDetails> {
    await loadEditableProgram(this.repo, actor, programId);
    await loadChapterInProgram(this.repo, programId, chapterId);
    const handler = getHandler(this.handlers, body.lessonType);

    // Validate type-specific details up front so an invalid payload never leaves
    // an orphaned lesson row behind.
    if (body.details !== undefined) {
      handler.detailsSchema.parse(body.details);
    }

    const lesson = await this.repo.createLesson({
      chapterId,
      orderIndex: body.orderIndex ?? (await this.nextOrderIndex(chapterId)),
      lessonType: body.lessonType,
      status: body.status,
      visibility: body.visibility,
      prerequisiteLessonId: body.prerequisiteLessonId ?? null,
      metadata: body.metadata ?? {}, // titles live in translations now (doc 12 §6)
    });

    // Handler validates `details` against its own schema and throws on mismatch.
    if (body.details !== undefined) {
      await handler.saveDetails(lesson.id, body.details);
    }
    await writeLocalizedFields(this.repo, LESSON_ENTITY, lesson.id, {
      title: body.title,
      description: body.description,
    });
    return this.toView(lesson, locale);
  }

  async update(
    actor: Actor,
    programId: string,
    chapterId: string,
    lessonId: string,
    body: UpdateLessonBody,
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<LessonWithDetails> {
    await loadEditableProgram(this.repo, actor, programId);
    await loadChapterInProgram(this.repo, programId, chapterId);
    const existing = await loadLessonInChapter(this.repo, chapterId, lessonId);
    const handler = getHandler(this.handlers, existing.lessonType);

    const patch: UpdateLessonPatch = {};
    if (body.orderIndex !== undefined) patch.orderIndex = body.orderIndex;
    if (body.status !== undefined) patch.status = body.status;
    if (body.visibility !== undefined) patch.visibility = body.visibility;
    if (body.prerequisiteLessonId !== undefined) {
      patch.prerequisiteLessonId = body.prerequisiteLessonId;
    }
    if (body.metadata !== undefined) {
      patch.metadata = { ...existing.metadata, ...body.metadata };
    }

    const lesson = (await this.repo.updateLesson(lessonId, patch)) ?? existing;
    if (body.details !== undefined) {
      await handler.saveDetails(lessonId, body.details);
    }
    await writeLocalizedFields(this.repo, LESSON_ENTITY, lessonId, {
      title: body.title,
      description: body.description,
    });
    return this.toView(lesson, locale);
  }

  private async toView(lesson: LessonRecord, locale: string): Promise<LessonWithDetails> {
    const rows = await this.repo.listTranslations(LESSON_ENTITY, [lesson.id]);
    const text = resolveLocalizedText(rows, lesson.id, locale, config.DEFAULT_LOCALE);
    return {
      lesson,
      title: text.title,
      description: text.description,
      details: await getHandler(this.handlers, lesson.lessonType).getDetails(lesson.id),
    };
  }

  async publish(
    actor: Actor,
    programId: string,
    chapterId: string,
    lessonId: string,
  ): Promise<LessonRecord> {
    await loadEditableProgram(this.repo, actor, programId);
    await loadChapterInProgram(this.repo, programId, chapterId);
    const existing = await loadLessonInChapter(this.repo, chapterId, lessonId);
    const handler = getHandler(this.handlers, existing.lessonType);

    const lesson = (await this.repo.updateLesson(lessonId, { status: 'published' })) ?? existing;
    await handler.onPublish(lesson);
    return lesson;
  }

  async remove(
    actor: Actor,
    programId: string,
    chapterId: string,
    lessonId: string,
  ): Promise<void> {
    await loadEditableProgram(this.repo, actor, programId);
    await loadChapterInProgram(this.repo, programId, chapterId);
    await loadLessonInChapter(this.repo, chapterId, lessonId);
    await this.repo.softDeleteLesson(lessonId);
  }

  // Adds a student to an invite_only lesson's allow-list (doc 12 §5). Owner/admin
  // only, and the lesson must belong to the program/chapter in the path.
  async invite(
    actor: Actor,
    programId: string,
    chapterId: string,
    lessonId: string,
    studentId: string,
  ): Promise<void> {
    await loadEditableProgram(this.repo, actor, programId);
    await loadChapterInProgram(this.repo, programId, chapterId);
    await loadLessonInChapter(this.repo, chapterId, lessonId);
    await this.repo.addLessonInvite(lessonId, studentId);
  }

  private async nextOrderIndex(chapterId: string): Promise<number> {
    const existing = await this.repo.listLessonsByChapter(chapterId);
    return existing.reduce((max, l) => Math.max(max, l.orderIndex + 1), 0);
  }
}
