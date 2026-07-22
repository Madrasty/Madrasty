import type {
  LearningProgramsRepository,
  UpdateChapterPatch,
} from './learning-programs.repository';
import { loadChapterInProgram, loadEditableProgram } from './guards';
import type { Actor, ChapterRecord } from './types';
import type { CreateChapterBody, UpdateChapterBody } from './learning-programs.schemas';

export class ChaptersService {
  constructor(private readonly repo: LearningProgramsRepository) {}

  async create(actor: Actor, programId: string, body: CreateChapterBody): Promise<ChapterRecord> {
    await loadEditableProgram(this.repo, actor, programId);
    // Default new chapters to the end of the current order.
    const orderIndex = body.orderIndex ?? (await this.nextOrderIndex(programId));
    return this.repo.createChapter({
      programId,
      orderIndex,
      title: body.title ?? null,
      metadata: body.metadata ?? {},
    });
  }

  async update(
    actor: Actor,
    programId: string,
    chapterId: string,
    body: UpdateChapterBody,
  ): Promise<ChapterRecord> {
    await loadEditableProgram(this.repo, actor, programId);
    const chapter = await loadChapterInProgram(this.repo, programId, chapterId);

    const patch: UpdateChapterPatch = {};
    if (body.orderIndex !== undefined) patch.orderIndex = body.orderIndex;
    if (body.title !== undefined) patch.title = body.title;
    if (body.metadata !== undefined) patch.metadata = { ...chapter.metadata, ...body.metadata };

    const updated = await this.repo.updateChapter(chapterId, patch);
    return updated ?? chapter;
  }

  async remove(actor: Actor, programId: string, chapterId: string): Promise<void> {
    await loadEditableProgram(this.repo, actor, programId);
    await loadChapterInProgram(this.repo, programId, chapterId);
    await this.repo.softDeleteChapter(chapterId);
  }

  async list(programId: string): Promise<ChapterRecord[]> {
    return this.repo.listChaptersByProgram(programId);
  }

  private async nextOrderIndex(programId: string): Promise<number> {
    const existing = await this.repo.listChaptersByProgram(programId);
    return existing.reduce((max, c) => Math.max(max, c.orderIndex + 1), 0);
  }
}
