import type { LearningProgramsRepository } from './learning-programs.repository';
import { loadEditableProgram } from './guards';
import { toProgramSummary, type ProgramSummary } from './views';
import type { Actor, EnrollmentRecord, EnrollmentSource } from './types';

export interface GrantEnrollmentInput {
  studentId: string;
  source?: EnrollmentSource;
  expiresAt?: Date | null;
}

export interface EnrolledProgram extends ProgramSummary {
  enrollment: {
    source: EnrollmentSource;
    grantedAt: Date;
    expiresAt: Date | null;
  };
}

export class EnrollmentService {
  constructor(private readonly repo: LearningProgramsRepository) {}

  // Owner-teacher or admin grants a student access directly (doc 12 — lets access
  // be exercised before payments exist). Defaults to source 'admin_grant'.
  // The FK on student_id enforces the student exists; the DB rejects a bad id.
  async grant(
    actor: Actor,
    programId: string,
    input: GrantEnrollmentInput,
  ): Promise<EnrollmentRecord> {
    await loadEditableProgram(this.repo, actor, programId);
    return this.repo.createEnrollment({
      studentId: input.studentId,
      programId,
      source: input.source ?? 'admin_grant',
      expiresAt: input.expiresAt ?? null,
    });
  }

  // A student's currently-active enrolled programs (doc 12 §8 "My Programs").
  // Enrollment may point at any program status (e.g. an admin grant before the
  // program is published), so this isn't limited to published programs.
  async listMyPrograms(studentId: string): Promise<EnrolledProgram[]> {
    const now = new Date();
    const active = await this.repo.listActiveEnrollmentsByStudent(studentId, now);
    const programs = await this.repo.getProgramsByIds(active.map((e) => e.programId));
    const byId = new Map(programs.map((p) => [p.id, p]));

    const result: EnrolledProgram[] = [];
    const seen = new Set<string>();
    for (const enrollment of active) {
      // De-dupe if a student holds more than one active grant for a program;
      // keep the most recent (listActive... is ordered granted_at desc).
      if (seen.has(enrollment.programId)) continue;
      const program = byId.get(enrollment.programId);
      if (!program) continue; // program was soft-deleted
      seen.add(enrollment.programId);
      result.push({
        ...toProgramSummary(program),
        enrollment: {
          source: enrollment.source,
          grantedAt: enrollment.grantedAt,
          expiresAt: enrollment.expiresAt,
        },
      });
    }
    return result;
  }
}
