import { HttpError } from '../../lib/http-error';
import { isOwnerOrAdmin } from './authorization';
import { resolveLessonAccess } from './access';
import { getHandler, type LessonHandlerRegistry } from './lesson-types/handler';
import type {
  LearningProgramsRepository,
  ListPublishedFilter,
} from './learning-programs.repository';
import { toProgramSummary, type ProgramSummary } from './views';
import type { LessonRecord, Viewer } from './types';

export interface LessonView {
  id: string;
  lessonType: string;
  status: string;
  visibility: string;
  orderIndex: number;
  title: unknown;
  locked: boolean;
  details: Record<string, unknown> | null;
}
export interface ChapterView {
  id: string;
  orderIndex: number;
  title: unknown;
  lessons: LessonView[];
}
export interface ProgramContentView extends ProgramSummary {
  chapters: ChapterView[];
}

// Public browsing (student/parent side, and anonymous visitors).
export class BrowseService {
  constructor(
    private readonly repo: LearningProgramsRepository,
    private readonly handlers: LessonHandlerRegistry,
  ) {}

  async listPublished(filter: ListPublishedFilter): Promise<ProgramSummary[]> {
    const programs = await this.repo.listPublishedPrograms(filter);
    return programs.map(toProgramSummary);
  }

  // Full program tree with per-lesson visibility gating. Free lessons expose
  // their details; paid/locked/invite-only lessons are returned as locked with
  // details omitted — unless the viewer owns the program, is an admin, or has an
  // active enrollment (with prerequisite/invite checks per lesson).
  async getProgramContent(programId: string, viewer: Viewer): Promise<ProgramContentView> {
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

    const chapters = await this.repo.listChaptersByProgram(programId);
    const chapterViews: ChapterView[] = [];
    for (const chapter of chapters) {
      const lessons = await this.repo.listLessonsByChapter(chapter.id);
      // The public only sees published lessons; owner/admin see every status.
      const visible = ownerOrAdmin
        ? lessons
        : lessons.filter((l) => l.status === 'published');
      const lessonViews = await Promise.all(
        visible.map((lesson) => this.toLessonView(lesson, viewer, { ownerOrAdmin, enrolled })),
      );
      chapterViews.push({
        id: chapter.id,
        orderIndex: chapter.orderIndex,
        title: chapter.title ?? null,
        lessons: lessonViews,
      });
    }

    return { ...toProgramSummary(program), chapters: chapterViews };
  }

  private async toLessonView(
    lesson: LessonRecord,
    viewer: Viewer,
    ctx: { ownerOrAdmin: boolean; enrolled: boolean },
  ): Promise<LessonView> {
    const canView = await resolveLessonAccess(this.repo, lesson, viewer, ctx);
    const details = canView
      ? await getHandler(this.handlers, lesson.lessonType).getDetails(lesson.id)
      : null;
    return {
      id: lesson.id,
      lessonType: lesson.lessonType,
      status: lesson.status,
      visibility: lesson.visibility,
      orderIndex: lesson.orderIndex,
      title: lesson.metadata.title ?? null,
      locked: !canView,
      details,
    };
  }
}
