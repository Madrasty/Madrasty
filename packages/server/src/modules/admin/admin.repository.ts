import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  adminAuditLog,
  learningPrograms,
  teacherProfiles,
  translations,
  users,
} from '../../db/schema/index';

export interface TeacherRow {
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  verificationStatus: string;
  createdAt: Date;
}

export interface ProgramRow {
  id: string;
  teacherId: string;
  teacherName: string | null;
  gradeLevel: string | null;
  priceEgp: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TranslationRow {
  entityId: string;
  locale: string;
  field: string;
  value: string;
}

export interface AuditEntry {
  actorId: string;
  action: string;
  targetType: 'teacher' | 'program';
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface AdminRepository {
  listTeachersByVerification(status: string): Promise<TeacherRow[]>;
  getTeacherVerification(userId: string): Promise<string | null>;
  setTeacherVerification(userId: string, status: string): Promise<void>;
  listProgramsByStatus(status: string): Promise<ProgramRow[]>;
  getProgramStatus(programId: string): Promise<{ status: string; teacherId: string } | null>;
  setProgramStatus(programId: string, status: string): Promise<void>;
  listProgramTranslations(programIds: string[]): Promise<TranslationRow[]>;
  writeAudit(entry: AuditEntry): Promise<void>;
}

const fullNameOf = (metadata: unknown): string | null => {
  const name = (metadata as { fullName?: unknown } | null)?.fullName;
  return typeof name === 'string' ? name : null;
};

export class DrizzleAdminRepository implements AdminRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async listTeachersByVerification(status: string): Promise<TeacherRow[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        metadata: users.metadata,
        email: users.email,
        phone: users.phone,
        verificationStatus: teacherProfiles.verificationStatus,
        createdAt: users.createdAt,
      })
      .from(teacherProfiles)
      .innerJoin(users, eq(users.id, teacherProfiles.userId))
      .where(and(eq(teacherProfiles.verificationStatus, status as never), isNull(users.deletedAt)))
      .orderBy(desc(users.createdAt));
    return rows.map((r) => ({
      userId: r.userId,
      fullName: fullNameOf(r.metadata),
      email: r.email,
      phone: r.phone,
      verificationStatus: r.verificationStatus,
      createdAt: r.createdAt,
    }));
  }

  async getTeacherVerification(userId: string): Promise<string | null> {
    const rows = await this.db
      .select({ status: teacherProfiles.verificationStatus })
      .from(teacherProfiles)
      .where(eq(teacherProfiles.userId, userId))
      .limit(1);
    return rows[0]?.status ?? null;
  }

  async setTeacherVerification(userId: string, status: string): Promise<void> {
    await this.db
      .update(teacherProfiles)
      .set({ verificationStatus: status as never })
      .where(eq(teacherProfiles.userId, userId));
  }

  async listProgramsByStatus(status: string): Promise<ProgramRow[]> {
    const rows = await this.db
      .select({
        id: learningPrograms.id,
        teacherId: learningPrograms.teacherId,
        teacherMetadata: users.metadata,
        gradeLevel: learningPrograms.gradeLevel,
        priceEgp: learningPrograms.priceEgp,
        status: learningPrograms.status,
        createdAt: learningPrograms.createdAt,
        updatedAt: learningPrograms.updatedAt,
      })
      .from(learningPrograms)
      .innerJoin(users, eq(users.id, learningPrograms.teacherId))
      .where(and(eq(learningPrograms.status, status as never), isNull(learningPrograms.deletedAt)))
      .orderBy(desc(learningPrograms.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      teacherId: r.teacherId,
      teacherName: fullNameOf(r.teacherMetadata),
      gradeLevel: r.gradeLevel,
      priceEgp: r.priceEgp,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getProgramStatus(programId: string): Promise<{ status: string; teacherId: string } | null> {
    const rows = await this.db
      .select({ status: learningPrograms.status, teacherId: learningPrograms.teacherId })
      .from(learningPrograms)
      .where(and(eq(learningPrograms.id, programId), isNull(learningPrograms.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async setProgramStatus(programId: string, status: string): Promise<void> {
    await this.db
      .update(learningPrograms)
      .set({ status: status as never, updatedAt: new Date() })
      .where(eq(learningPrograms.id, programId));
  }

  async listProgramTranslations(programIds: string[]): Promise<TranslationRow[]> {
    if (programIds.length === 0) return [];
    return this.db
      .select({
        entityId: translations.entityId,
        locale: translations.locale,
        field: translations.field,
        value: translations.value,
      })
      .from(translations)
      .where(
        and(eq(translations.entityType, 'learning_program'), inArray(translations.entityId, programIds)),
      );
  }

  async writeAudit(entry: AuditEntry): Promise<void> {
    await this.db.insert(adminAuditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
    });
  }
}
