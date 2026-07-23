import { and, eq, isNull, or } from 'drizzle-orm';
import type { UserRole, UserStatus } from '@madrasty/shared';
import { db as defaultDb, type Database } from '../../db/client';
import { teacherProfiles, users } from '../../db/schema/index';

// Full internal record, including the password hash (never sent to clients).
export interface UserRecord {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  role: UserRole;
  localePreference: string;
  status: UserStatus;
  verificationLevel: number;
}

export interface CreateParentInput {
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  localePreference: string;
}

// Teacher self-registration carries the same fields as a parent.
export type CreateTeacherInput = CreateParentInput;

// Data-access boundary for auth. The service depends on this interface, so tests
// can inject an in-memory fake instead of a live Postgres.
export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByIdentifier(identifier: string): Promise<UserRecord | null>;
  existsByEmailOrPhone(email: string, phone: string): Promise<boolean>;
  createParent(input: CreateParentInput): Promise<UserRecord>;
  // Creates a teacher user plus its (unverified) teacher_profiles row.
  createTeacher(input: CreateTeacherInput): Promise<UserRecord>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}

// The full name is not a first-class column in the `users` schema (doc 03); it
// lives in the flexible `metadata` JSONB, per the schema's "metadata absorbs
// optional fields" principle. This maps a DB row to our UserRecord.
function toRecord(row: typeof users.$inferSelect): UserRecord {
  const metadata = (row.metadata ?? {}) as { fullName?: string };
  return {
    id: row.id,
    fullName: metadata.fullName ?? null,
    email: row.email,
    phone: row.phone,
    passwordHash: row.passwordHash,
    role: row.role as UserRole,
    localePreference: row.localePreference,
    status: row.status as UserStatus,
    verificationLevel: row.verificationLevel,
  };
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(or(eq(users.email, identifier), eq(users.phone, identifier)), isNull(users.deletedAt)))
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async existsByEmailOrPhone(email: string, phone: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.email, email), eq(users.phone, phone)))
      .limit(1);
    return rows.length > 0;
  }

  async createParent(input: CreateParentInput): Promise<UserRecord> {
    const rows = await this.db
      .insert(users)
      .values({
        email: input.email,
        phone: input.phone,
        passwordHash: input.passwordHash,
        role: 'parent',
        localePreference: input.localePreference,
        // Parent is the root, verified-guardian account (doc 11). Level 1 is the
        // MVP gate; phone/email verification flip the *_verified_at columns later.
        verificationLevel: 1,
        metadata: { fullName: input.fullName },
      })
      .returning();
    return toRecord(rows[0]);
  }

  async createTeacher(input: CreateTeacherInput): Promise<UserRecord> {
    // User + teacher_profiles created atomically; the profile starts unverified
    // (verification_status defaults to 'pending') until an admin verifies them.
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(users)
        .values({
          email: input.email,
          phone: input.phone,
          passwordHash: input.passwordHash,
          role: 'teacher',
          localePreference: input.localePreference,
          verificationLevel: 1,
          metadata: { fullName: input.fullName },
        })
        .returning();
      await tx.insert(teacherProfiles).values({ userId: rows[0].id });
      return toRecord(rows[0]);
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
