import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import { isOwnerOrAdmin } from './authorization';
import { resolveLessonAccess } from './access';
import { getHandler, type LessonHandlerRegistry } from './lesson-types/handler';
import type {
  LearningProgramsRepository,
  ListPublishedFilter,
  TranslationRow,
} from './learning-programs.repository';
import {
  CHAPTER_ENTITY,
  LESSON_ENTITY,
  PROGRAM_ENTITY,
  resolveLocalizedText,
} from './localized';
import { toProgramSummary, type ProgramSummary } from './views';
import type { LessonRecord, Viewer } from './types';

export interface LessonView {
  id: string;
  lessonType: string;
  status: string;
  visibility: string;
  orderIndex: number;
  title: string | null;
  description: string | null;
  locked: boolean;
  details: Record<string, unknown> | null;
}
export interface ChapterView {
  id: string;
  orderIndex: number;
  title: string | null;
  description: string | null;
  lessons: LessonView[];
}
export interface ProgramContentView extends ProgramSummary {
  chapters: ChapterView[];
}

// Public browsing (student/parent side, and anonymous visitors). All title/
// description text is resolved for `locale` from the translations table, with a
// fallback to config.DEFAULT_LOCALE (doc 12 §6).
export class BrowseService {
  constructor(
    private readonly repo: LearningProgramsRepository,
    private readonly handlers: LessonHandlerRegistry,
  ) {}

  async listPublished(
    filter: ListPublishedFilter,
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<ProgramSummary[]> {
    const programs = await this.repo.listPublishedPrograms(filter);
    const rows = await this.repo.listTranslations(
      PROGRAM_ENTITY,
      programs.map((p) => p.id),
    );
    return programs.map((p) =>
      toProgramSummary(p, resolveLocalizedText(rows, p.id, locale, config.DEFAULT_LOCALE)),
    );
  }

  // Full program tree with per-lesson visibility gating (see resolveLessonAccess).
  async getProgramContent(
    programId: string,
    viewer: Viewer,
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<ProgramContentView> {
    const program = await this.repo.getProgramById(programId);
    if (!program) {
      throw HttpError.notFound('program_not_found', 'Program not found.');
    }
    const ownerOrAdmin = isOwnerOrAdmin(program, viewer);
    // Don't reveal unpublished programs to the public.
    if (program.status !== 'published' && !ownerOrAdmin) {
      throw HttpError.notFound('program_not_found', 'Program not found.');
    }

    // One enrollment lookup per request (not per lesson).
    const enrolled =
      !ownerOrAdmin && viewer.userId
        ? (await this.repo.findActiveEnrollment(viewer.userId, programId, new Date())) !== null
        : false;

    // Gather the chapters + their visible lessons first, then batch-load all the
    // translations for the tree in three queries (program / chapters / lessons).
    const chapters = await this.repo.listChaptersByProgram(programId);
    const perChapter = await Promise.all(
      chapters.map(async (chapter) => {
        const lessons = await this.repo.listLessonsByChapter(chapter.id);
        const visible = ownerOrAdmin ? lessons : lessons.filter((l) => l.status === 'published');
        return { chapter, visible };
      }),
    );

    const lessonIds = perChapter.flatMap((c) => c.visible.map((l) => l.id));
    const [programRows, chapterRows, lessonRows] = await Promise.all([
      this.repo.listTranslations(PROGRAM_ENTITY, [programId]),
      this.repo.listTranslations(
        CHAPTER_ENTITY,
        chapters.map((c) => c.id),
      ),
      this.repo.listTranslations(LESSON_ENTITY, lessonIds),
    ]);

    const chapterViews: ChapterView[] = [];
    for (const { chapter, visible } of perChapter) {
      const lessonViews = await Promise.all(
        visible.map((lesson) =>
          this.toLessonView(lesson, viewer, { ownerOrAdmin, enrolled }, lessonRows, locale),
        ),
      );
      const text = resolveLocalizedText(chapterRows, chapter.id, locale, config.DEFAULT_LOCALE);
      chapterViews.push({
        id: chapter.id,
        orderIndex: chapter.orderIndex,
        title: text.title,
        description: text.description,
        lessons: lessonViews,
      });
    }

    return {
      ...toProgramSummary(
        program,
        resolveLocalizedText(programRows, programId, locale, config.DEFAULT_LOCALE),
      ),
      chapters: chapterViews,
    };
  }

  private async toLessonView(
    lesson: LessonRecord,
    viewer: Viewer,
    ctx: { ownerOrAdmin: boolean; enrolled: boolean },
    lessonRows: TranslationRow[],
    locale: string,
  ): Promise<LessonView> {
    const canView = await resolveLessonAccess(this.repo, lesson, viewer, ctx);
    const details = canView
      ? await getHandler(this.handlers, lesson.lessonType).getDetails(lesson.id)
      : null;
    const text = resolveLocalizedText(lessonRows, lesson.id, locale, config.DEFAULT_LOCALE);
    return {
      id: lesson.id,
      lessonType: lesson.lessonType,
      status: lesson.status,
      visibility: lesson.visibility,
      orderIndex: lesson.orderIndex,
      title: text.title,
      description: text.description,
      locked: !canView,
      details,
    };
  }
}
