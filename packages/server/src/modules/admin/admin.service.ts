import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import type { PendingProgram, PendingTeacher } from '@madrasty/shared';
import type { AdminRepository, ProgramRow, TranslationRow } from './admin.repository';

// Resolve a translated field for the request locale, falling back to the default
// locale (doc 12 §6). Kept local so the admin module doesn't depend on the
// learning-programs internals.
function resolveText(
  rows: TranslationRow[],
  entityId: string,
  field: string,
  locale: string,
): string | null {
  let fallback: string | null = null;
  for (const r of rows) {
    if (r.entityId !== entityId || r.field !== field) continue;
    if (r.locale === locale) return r.value;
    if (r.locale === config.DEFAULT_LOCALE) fallback = r.value;
  }
  return fallback;
}

export interface AdminActor {
  id: string;
  role: string;
}

// Admin governance (doc 09). Every mutating action writes an admin_audit_log
// entry — admins act on accounts through logged, reversible-by-new-event actions
// (doc 01 §7), never silent edits.
export class AdminService {
  constructor(private readonly repo: AdminRepository) {}

  // --- Teacher verification (teacher_profiles.verification_status) ---
  async listPendingTeachers(status = 'pending'): Promise<PendingTeacher[]> {
    const rows = await this.repo.listTeachersByVerification(status);
    return rows.map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      verificationStatus: r.verificationStatus as PendingTeacher['verificationStatus'],
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async verifyTeacher(actor: AdminActor, userId: string): Promise<void> {
    await this.transitionTeacher(actor, userId, 'verified', 'teacher.verify');
  }

  async rejectTeacher(actor: AdminActor, userId: string, reason?: string): Promise<void> {
    await this.transitionTeacher(actor, userId, 'rejected', 'teacher.reject', reason);
  }

  private async transitionTeacher(
    actor: AdminActor,
    userId: string,
    next: string,
    action: string,
    reason?: string,
  ): Promise<void> {
    const current = await this.repo.getTeacherVerification(userId);
    if (current === null) {
      throw HttpError.notFound('teacher_not_found', 'No teacher profile for that user.');
    }
    await this.repo.setTeacherVerification(userId, next);
    await this.repo.writeAudit({
      actorId: actor.id,
      action,
      targetType: 'teacher',
      targetId: userId,
      metadata: { from: current, to: next, ...(reason ? { reason } : {}) },
    });
  }

  // --- Program approval (learning_programs.status) ---
  async listPendingPrograms(
    status = 'pending_review',
    locale: string = config.DEFAULT_LOCALE,
  ): Promise<PendingProgram[]> {
    const programs = await this.repo.listProgramsByStatus(status);
    const rows = await this.repo.listProgramTranslations(programs.map((p) => p.id));
    return programs.map((p) => this.toPendingProgram(p, rows, locale));
  }

  async approveProgram(actor: AdminActor, programId: string): Promise<void> {
    await this.transitionProgram(actor, programId, 'published', 'program.approve');
  }

  async rejectProgram(actor: AdminActor, programId: string, reason?: string): Promise<void> {
    // Rejection returns a program to the teacher as a draft to revise (doc 09).
    await this.transitionProgram(actor, programId, 'draft', 'program.reject', reason);
  }

  private async transitionProgram(
    actor: AdminActor,
    programId: string,
    next: string,
    action: string,
    reason?: string,
  ): Promise<void> {
    const current = await this.repo.getProgramStatus(programId);
    if (!current) {
      throw HttpError.notFound('program_not_found', 'Program not found.');
    }
    // Only a submitted program can be approved/rejected — this is the review gate.
    if (current.status !== 'pending_review') {
      throw HttpError.conflict(
        'program_not_in_review',
        `A ${current.status} program is not awaiting review.`,
      );
    }
    await this.repo.setProgramStatus(programId, next);
    await this.repo.writeAudit({
      actorId: actor.id,
      action,
      targetType: 'program',
      targetId: programId,
      metadata: { from: current.status, to: next, ...(reason ? { reason } : {}) },
    });
  }

  private toPendingProgram(p: ProgramRow, rows: TranslationRow[], locale: string): PendingProgram {
    return {
      id: p.id,
      teacherId: p.teacherId,
      teacherName: p.teacherName,
      gradeLevel: p.gradeLevel,
      priceEgp: p.priceEgp,
      status: p.status as PendingProgram['status'],
      title: resolveText(rows, p.id, 'title', locale),
      description: resolveText(rows, p.id, 'description', locale),
      submittedAt: p.updatedAt.toISOString(),
    };
  }
}
