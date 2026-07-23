import { config } from '../../config/index';
import type {
  LearningProgramsRepository,
  UpdateChapterPatch,
} from './learning-programs.repository';
import { loadChapterInProgram, loadEditableProgram } from './guards';
import { CHAPTER_ENTITY, resolveLocalizedText, writeLocalizedFields } from './localized';
import type { Actor, ChapterRecord } from './types';
import type { CreateChapterBody, UpdateChapterBody } from './learning-programs.schemas';

// A chapter with its title/description resolved for the request locale.
export interface LocalizedChapter {
  id: string;
  programId: string;
  orderIndex: number;
  title: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
}

export class ChaptersService {
  constructor(private readonly repo: LearningProgramsRepository) {}

  async create(
    actor: Actor,
    programId: string,
    body: CreateChapterBody,
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<LocalizedChapter> {
    await loadEditableProgram(this.repo, actor, programId);
    // Default new chapters to the end of the current order.
    const orderIndex = body.orderIndex ?? (await this.nextOrderIndex(programId));
    const chapter = await this.repo.createChapter({
      programId,
      orderIndex,
      title: null, // titles live in translations now (doc 12 §6), not chapters.title
      metadata: body.metadata ?? {},
    });
    await writeLocalizedFields(this.repo, CHAPTER_ENTITY, chapter.id, {
      title: body.title,
      description: body.description,
    });
    return this.toView(chapter, locale);
  }

  async update(
    actor: Actor,
    programId: string,
    chapterId: string,
    body: UpdateChapterBody,
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<LocalizedChapter> {
    await loadEditableProgram(this.repo, actor, programId);
    const chapter = await loadChapterInProgram(this.repo, programId, chapterId);

    const patch: UpdateChapterPatch = {};
    if (body.orderIndex !== undefined) patch.orderIndex = body.orderIndex;
    if (body.metadata !== undefined) patch.metadata = { ...chapter.metadata, ...body.metadata };

    const updated = (await this.repo.updateChapter(chapterId, patch)) ?? chapter;
    await writeLocalizedFields(this.repo, CHAPTER_ENTITY, chapterId, {
      title: body.title,
      description: body.description,
    });
    return this.toView(updated, locale);
  }

  async remove(actor: Actor, programId: string, chapterId: string): Promise<void> {
    await loadEditableProgram(this.repo, actor, programId);
    await loadChapterInProgram(this.repo, programId, chapterId);
    await this.repo.softDeleteChapter(chapterId);
  }

  private async toView(chapter: ChapterRecord, locale: string): Promise<LocalizedChapter> {
    const rows = await this.repo.listTranslations(CHAPTER_ENTITY, [chapter.id]);
    const text = resolveLocalizedText(rows, chapter.id, locale, config.DEFAULT_LOCALE);
    return {
      id: chapter.id,
      programId: chapter.programId,
      orderIndex: chapter.orderIndex,
      title: text.title,
      description: text.description,
      metadata: chapter.metadata,
    };
  }

  private async nextOrderIndex(programId: string): Promise<number> {
    const existing = await this.repo.listChaptersByProgram(programId);
    return existing.reduce((max, c) => Math.max(max, c.orderIndex + 1), 0);
  }
}
