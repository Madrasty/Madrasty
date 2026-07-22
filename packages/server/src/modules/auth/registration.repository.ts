import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  guardianApprovalRequests,
  otpVerifications,
  parentChildren,
  studentProfiles,
  users,
} from '../../db/schema/index';
import { phoneCandidates } from '../../lib/phone';

export type GuardianApprovalStatus = 'awaiting_parent' | 'approved' | 'rejected' | 'expired';
export type OtpChannel = 'sms' | 'email';
export type GuardianRelationship = 'father' | 'mother' | 'guardian' | 'other';

export interface CreateStudentInput {
  fullName: string;
  userStatus: 'active' | 'pending_verification';
  gradeLevel: string;
  schoolName: string | null;
  profileStatus: 'active' | 'pending_approval';
  profileMetadata: Record<string, unknown>;
}

export interface LinkParentChildInput {
  parentId: string;
  studentId: string;
  relationship: GuardianRelationship;
  approvedAt: Date | null;
}

export interface CreateApprovalRequestInput {
  pendingStudentName: string;
  pendingStudentGrade: string;
  parentMobile: string;
  matchedParentId: string | null;
  studentProfileId: string;
  approvalToken: string;
  expiresAt: Date;
}

export interface ApprovalRequestRecord {
  id: string;
  pendingStudentName: string | null;
  pendingStudentGrade: string | null;
  parentMobile: string | null;
  matchedParentId: string | null;
  studentProfileId: string | null;
  status: GuardianApprovalStatus;
  approvalToken: string | null;
  expiresAt: Date | null;
  resolvedAt: Date | null;
}

export interface CreateOtpInput {
  userId: string | null;
  channel: OtpChannel;
  codeHash: string;
  expiresAt: Date;
}

export interface OtpRecord {
  id: string;
  userId: string | null;
  channel: OtpChannel;
  codeHash: string;
  expiresAt: Date;
  verifiedAt: Date | null;
  attemptCount: number;
}

export type ApprovalRequestPatch = Partial<
  Pick<ApprovalRequestRecord, 'status' | 'matchedParentId' | 'resolvedAt'>
>;

// Data-access boundary for the registration flows. The service depends on this
// interface so tests can inject an in-memory fake instead of live Postgres.
export interface RegistrationRepository {
  createStudent(input: CreateStudentInput): Promise<{ userId: string }>;
  linkParentChild(input: LinkParentChildInput): Promise<void>;
  findParentByPhone(phone: string): Promise<{ id: string; phone: string | null } | null>;
  createApprovalRequest(input: CreateApprovalRequestInput): Promise<{ id: string }>;
  findApprovalRequestByToken(token: string): Promise<ApprovalRequestRecord | null>;
  updateApprovalRequest(id: string, patch: ApprovalRequestPatch): Promise<void>;
  activateStudent(studentUserId: string): Promise<void>;
  createOtp(input: CreateOtpInput): Promise<{ id: string }>;
  findLatestActiveOtp(userId: string, channel: OtpChannel): Promise<OtpRecord | null>;
  markOtpVerified(id: string): Promise<void>;
  incrementOtpAttempts(id: string): Promise<void>;
}

function toApprovalRecord(row: typeof guardianApprovalRequests.$inferSelect): ApprovalRequestRecord {
  return {
    id: row.id,
    pendingStudentName: row.pendingStudentName,
    pendingStudentGrade: row.pendingStudentGrade,
    parentMobile: row.parentMobile,
    matchedParentId: row.matchedParentId,
    studentProfileId: row.studentProfileId,
    status: row.status as GuardianApprovalStatus,
    approvalToken: row.approvalToken,
    expiresAt: row.expiresAt,
    resolvedAt: row.resolvedAt,
  };
}

export class DrizzleRegistrationRepository implements RegistrationRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async createStudent(input: CreateStudentInput): Promise<{ userId: string }> {
    // A student is a user row + a student_profiles row — create both atomically.
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          role: 'student',
          status: input.userStatus,
          metadata: { fullName: input.fullName },
        })
        .returning({ id: users.id });
      await tx.insert(studentProfiles).values({
        userId: user.id,
        gradeLevel: input.gradeLevel,
        schoolName: input.schoolName,
        status: input.profileStatus,
        metadata: input.profileMetadata,
      });
      return { userId: user.id };
    });
  }

  async linkParentChild(input: LinkParentChildInput): Promise<void> {
    await this.db.insert(parentChildren).values({
      parentId: input.parentId,
      studentId: input.studentId,
      relationship: input.relationship,
      isPrimary: true,
      approvedAt: input.approvedAt,
    });
  }

  async findParentByPhone(phone: string): Promise<{ id: string; phone: string | null } | null> {
    const rows = await this.db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(
        and(
          eq(users.role, 'parent'),
          inArray(users.phone, phoneCandidates(phone)),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async createApprovalRequest(input: CreateApprovalRequestInput): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(guardianApprovalRequests)
      .values({
        pendingStudentName: input.pendingStudentName,
        pendingStudentGrade: input.pendingStudentGrade,
        parentMobile: input.parentMobile,
        matchedParentId: input.matchedParentId,
        studentProfileId: input.studentProfileId,
        status: 'awaiting_parent',
        approvalToken: input.approvalToken,
        expiresAt: input.expiresAt,
      })
      .returning({ id: guardianApprovalRequests.id });
    return row;
  }

  async findApprovalRequestByToken(token: string): Promise<ApprovalRequestRecord | null> {
    const rows = await this.db
      .select()
      .from(guardianApprovalRequests)
      .where(eq(guardianApprovalRequests.approvalToken, token))
      .limit(1);
    return rows[0] ? toApprovalRecord(rows[0]) : null;
  }

  async updateApprovalRequest(id: string, patch: ApprovalRequestPatch): Promise<void> {
    await this.db
      .update(guardianApprovalRequests)
      .set(patch)
      .where(eq(guardianApprovalRequests.id, id));
  }

  async activateStudent(studentUserId: string): Promise<void> {
    await this.db
      .update(studentProfiles)
      .set({ status: 'active' })
      .where(eq(studentProfiles.userId, studentUserId));
    await this.db
      .update(users)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(users.id, studentUserId));
  }

  async createOtp(input: CreateOtpInput): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(otpVerifications)
      .values({
        userId: input.userId,
        channel: input.channel,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
      })
      .returning({ id: otpVerifications.id });
    return row;
  }

  async findLatestActiveOtp(userId: string, channel: OtpChannel): Promise<OtpRecord | null> {
    const rows = await this.db
      .select()
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.userId, userId),
          eq(otpVerifications.channel, channel),
          isNull(otpVerifications.verifiedAt),
        ),
      )
      .orderBy(desc(otpVerifications.createdAt))
      .limit(1);
    const row = rows[0];
    return row
      ? {
          id: row.id,
          userId: row.userId,
          channel: row.channel as OtpChannel,
          codeHash: row.codeHash,
          expiresAt: row.expiresAt,
          verifiedAt: row.verifiedAt,
          attemptCount: row.attemptCount,
        }
      : null;
  }

  async markOtpVerified(id: string): Promise<void> {
    await this.db
      .update(otpVerifications)
      .set({ verifiedAt: new Date() })
      .where(eq(otpVerifications.id, id));
  }

  async incrementOtpAttempts(id: string): Promise<void> {
    await this.db
      .update(otpVerifications)
      .set({ attemptCount: sql`${otpVerifications.attemptCount} + 1` })
      .where(eq(otpVerifications.id, id));
  }
}
