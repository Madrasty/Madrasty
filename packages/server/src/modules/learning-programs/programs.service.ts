import type {
  LearningProgramsRepository,
  UpdateProgramPatch,
} from './learning-programs.repository';
import { loadEditableProgram } from './guards';
import type { Actor, ProgramRecord } from './types';
import type { CreateProgramBody, UpdateProgramBody } from './learning-programs.schemas';

export class ProgramsService {
  constructor(private readonly repo: LearningProgramsRepository) {}

  // Create a program owned by the acting teacher (or admin). Starts as 'draft'.
  async create(actor: Actor, body: CreateProgramBody): Promise<ProgramRecord> {
    const metadata: Record<string, unknown> = { ...(body.metadata ?? {}) };
    if (body.title) metadata.title = body.title;
    return this.repo.createProgram({
      teacherId: actor.id,
      subjectId: body.subjectId ?? null,
      gradeLevel: body.gradeLevel ?? null,
      semester: body.semester ?? null,
      priceEgp: body.price != null ? String(body.price) : null,
      metadata,
    });
  }

  async update(actor: Actor, programId: string, body: UpdateProgramBody): Promise<ProgramRecord> {
    const program = await loadEditableProgram(this.repo, actor, programId);

    const patch: UpdateProgramPatch = {};
    if (body.subjectId !== undefined) patch.subjectId = body.subjectId;
    if (body.gradeLevel !== undefined) patch.gradeLevel = body.gradeLevel;
    if (body.semester !== undefined) patch.semester = body.semester;
    if (body.price !== undefined) patch.priceEgp = body.price != null ? String(body.price) : null;
    if (body.metadata !== undefined || body.title !== undefined) {
      patch.metadata = {
        ...program.metadata,
        ...(body.metadata ?? {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
      };
    }

    const updated = await this.repo.updateProgram(programId, patch);
    return updated ?? program;
  }

  // draft → published. Access to paid content later keys off this status.
  async publish(actor: Actor, programId: string): Promise<ProgramRecord> {
    await loadEditableProgram(this.repo, actor, programId);
    const updated = await this.repo.updateProgram(programId, { status: 'published' });
    return updated!;
  }

  async remove(actor: Actor, programId: string): Promise<void> {
    await loadEditableProgram(this.repo, actor, programId);
    await this.repo.softDeleteProgram(programId);
  }

  // A teacher's own programs across all statuses (drafts included).
  async listMine(actor: Actor): Promise<ProgramRecord[]> {
    return this.repo.listProgramsByTeacher(actor.id);
  }
}
