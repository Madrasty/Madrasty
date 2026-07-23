import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import type {
  LearningProgramsRepository,
  UpdateProgramPatch,
} from './learning-programs.repository';
import { loadEditableProgram } from './guards';
import { PROGRAM_ENTITY, resolveLocalizedText, writeLocalizedFields } from './localized';
import { toLocalizedProgram, type LocalizedProgram } from './views';
import type { Actor, ProgramRecord } from './types';
import type { CreateProgramBody, UpdateProgramBody } from './learning-programs.schemas';

export class ProgramsService {
  constructor(private readonly repo: LearningProgramsRepository) {}

  // Create a program owned by the acting teacher (or admin). Starts as 'draft'.
  // Titles/descriptions go to the translations table, not metadata (doc 12 §6).
  async create(actor: Actor, body: CreateProgramBody, locale: string = config.DEFAULT_LOCALE): Promise<LocalizedProgram> {
    const program = await this.repo.createProgram({
      teacherId: actor.id,
      subjectId: body.subjectId ?? null,
      gradeLevel: body.gradeLevel ?? null,
      semester: body.semester ?? null,
      priceEgp: body.price != null ? String(body.price) : null,
      metadata: body.metadata ?? {},
    });
    await writeLocalizedFields(this.repo, PROGRAM_ENTITY, program.id, {
      title: body.title,
      description: body.description,
    });
    return this.toView(program, locale);
  }

  async update(
    actor: Actor,
    programId: string,
    body: UpdateProgramBody,
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<LocalizedProgram> {
    const program = await loadEditableProgram(this.repo, actor, programId);

    const patch: UpdateProgramPatch = {};
    if (body.subjectId !== undefined) patch.subjectId = body.subjectId;
    if (body.gradeLevel !== undefined) patch.gradeLevel = body.gradeLevel;
    if (body.semester !== undefined) patch.semester = body.semester;
    if (body.price !== undefined) patch.priceEgp = body.price != null ? String(body.price) : null;
    if (body.metadata !== undefined) patch.metadata = { ...program.metadata, ...body.metadata };

    const updated = (await this.repo.updateProgram(programId, patch)) ?? program;
    await writeLocalizedFields(this.repo, PROGRAM_ENTITY, programId, {
      title: body.title,
      description: body.description,
    });
    return this.toView(updated, locale);
  }

  // Teacher submits a draft for admin review (draft → pending_review, doc 09).
  // Publishing to the catalog is an ADMIN action (the governance seam) — a
  // teacher cannot self-publish. Only a draft is submittable.
  async submitForReview(
    actor: Actor,
    programId: string,
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<LocalizedProgram> {
    const program = await loadEditableProgram(this.repo, actor, programId);
    if (program.status !== 'draft') {
      throw HttpError.conflict(
        'not_submittable',
        `A ${program.status} program can't be submitted for review.`,
      );
    }
    const updated = await this.repo.updateProgram(programId, { status: 'pending_review' });
    return this.toView(updated!, locale);
  }

  // draft → published, bypassing review. Kept for admin/internal use (the admin
  // approve action and test setup); NOT exposed on a teacher route.
  async publish(
    actor: Actor,
    programId: string,
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<LocalizedProgram> {
    await loadEditableProgram(this.repo, actor, programId);
    const updated = await this.repo.updateProgram(programId, { status: 'published' });
    return this.toView(updated!, locale);
  }

  async remove(actor: Actor, programId: string): Promise<void> {
    await loadEditableProgram(this.repo, actor, programId);
    await this.repo.softDeleteProgram(programId);
  }

  // A teacher's own programs across all statuses (drafts included).
  async listMine(actor: Actor, locale: string = config.DEFAULT_LOCALE): Promise<LocalizedProgram[]> {
    const programs = await this.repo.listProgramsByTeacher(actor.id);
    const rows = await this.repo.listTranslations(
      PROGRAM_ENTITY,
      programs.map((p) => p.id),
    );
    return programs.map((p) =>
      toLocalizedProgram(p, resolveLocalizedText(rows, p.id, locale, config.DEFAULT_LOCALE)),
    );
  }

  private async toView(program: ProgramRecord, locale: string): Promise<LocalizedProgram> {
    const rows = await this.repo.listTranslations(PROGRAM_ENTITY, [program.id]);
    return toLocalizedProgram(
      program,
      resolveLocalizedText(rows, program.id, locale, config.DEFAULT_LOCALE),
    );
  }
}
