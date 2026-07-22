import { randomUUID } from 'node:crypto';
import type {
  CreateParentInput,
  UserRecord,
  UserRepository,
} from '../src/modules/auth/auth.repository';
import type { RefreshTokenStore } from '../src/modules/auth/refresh-store';
import type {
  ApprovalRequestPatch,
  ApprovalRequestRecord,
  CreateApprovalRequestInput,
  CreateOtpInput,
  CreateStudentInput,
  LinkParentChildInput,
  OtpChannel,
  OtpRecord,
  RegistrationRepository,
} from '../src/modules/auth/registration.repository';
import type { SmsSender } from '../src/modules/auth/sms-sender';
import { normalizePhone } from '../src/lib/phone';

// In-memory UserRepository — same contract as the Drizzle one, no Postgres.
export class InMemoryUserRepository implements UserRepository {
  private byId = new Map<string, UserRecord>();

  async findById(id: string): Promise<UserRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    for (const rec of this.byId.values()) {
      if (rec.email === identifier || rec.phone === identifier) return rec;
    }
    return null;
  }

  async existsByEmailOrPhone(email: string, phone: string): Promise<boolean> {
    for (const rec of this.byId.values()) {
      if (rec.email === email || rec.phone === phone) return true;
    }
    return false;
  }

  async createParent(input: CreateParentInput): Promise<UserRecord> {
    const record: UserRecord = {
      id: randomUUID(),
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      passwordHash: input.passwordHash,
      role: 'parent',
      localePreference: input.localePreference,
      status: 'active',
      verificationLevel: 1,
    };
    this.byId.set(record.id, record);
    return record;
  }

  // Test helpers.
  setStatus(id: string, status: UserRecord['status']): void {
    const rec = this.byId.get(id);
    if (rec) rec.status = status;
  }

  insert(record: UserRecord): void {
    this.byId.set(record.id, record);
  }

  all(): UserRecord[] {
    return [...this.byId.values()];
  }
}

// In-memory RefreshTokenStore mirroring the Redis key-per-jti model.
export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private valid = new Set<string>();
  private key = (userId: string, jti: string) => `${userId}:${jti}`;

  async add(userId: string, jti: string): Promise<void> {
    this.valid.add(this.key(userId, jti));
  }

  async has(userId: string, jti: string): Promise<boolean> {
    return this.valid.has(this.key(userId, jti));
  }

  async remove(userId: string, jti: string): Promise<void> {
    this.valid.delete(this.key(userId, jti));
  }

  get size(): number {
    return this.valid.size;
  }
}

// Captures "sent" SMS messages so tests can read the OTP the parent would get.
export class FakeSmsSender implements SmsSender {
  readonly messages: { to: string; message: string }[] = [];

  async send(to: string, message: string): Promise<void> {
    this.messages.push({ to, message });
  }

  get last(): { to: string; message: string } | undefined {
    return this.messages[this.messages.length - 1];
  }

  // Pulls the numeric code out of the last message ("verification code: 123456").
  lastOtpCode(): string {
    const match = this.last?.message.match(/verification code:\s*(\d+)/);
    if (!match) throw new Error('no OTP code found in last SMS');
    return match[1];
  }
}

interface StudentProfile {
  status: 'active' | 'pending_approval';
  gradeLevel: string;
  schoolName: string | null;
  metadata: Record<string, unknown>;
}

// In-memory RegistrationRepository. Shares the InMemoryUserRepository so a parent
// created via AuthService is visible to findParentByPhone / activateStudent.
export class InMemoryRegistrationRepository implements RegistrationRepository {
  private profiles = new Map<string, StudentProfile>();
  private links: LinkParentChildInput[] = [];
  private requests: ApprovalRequestRecord[] = [];
  private otps: OtpRecord[] = [];

  constructor(private readonly users: InMemoryUserRepository) {}

  async createStudent(input: CreateStudentInput): Promise<{ userId: string }> {
    const userId = randomUUID();
    this.users.insert({
      id: userId,
      fullName: input.fullName,
      email: null,
      phone: null,
      passwordHash: null,
      role: 'student',
      localePreference: 'ar',
      status: input.userStatus,
      verificationLevel: 1,
    });
    this.profiles.set(userId, {
      status: input.profileStatus,
      gradeLevel: input.gradeLevel,
      schoolName: input.schoolName,
      metadata: input.profileMetadata,
    });
    return { userId };
  }

  async linkParentChild(input: LinkParentChildInput): Promise<void> {
    this.links.push({ ...input });
  }

  async findParentByPhone(phone: string): Promise<{ id: string; phone: string | null } | null> {
    const target = normalizePhone(phone);
    const parent = this.users
      .all()
      .find((u) => u.role === 'parent' && normalizePhone(u.phone ?? '') === target);
    return parent ? { id: parent.id, phone: parent.phone } : null;
  }

  async createApprovalRequest(input: CreateApprovalRequestInput): Promise<{ id: string }> {
    const record: ApprovalRequestRecord = {
      id: randomUUID(),
      pendingStudentName: input.pendingStudentName,
      pendingStudentGrade: input.pendingStudentGrade,
      parentMobile: input.parentMobile,
      matchedParentId: input.matchedParentId,
      studentProfileId: input.studentProfileId,
      status: 'awaiting_parent',
      approvalToken: input.approvalToken,
      expiresAt: input.expiresAt,
      resolvedAt: null,
    };
    this.requests.push(record);
    return { id: record.id };
  }

  async findApprovalRequestByToken(token: string): Promise<ApprovalRequestRecord | null> {
    const req = this.requests.find((r) => r.approvalToken === token);
    return req ? { ...req } : null;
  }

  async updateApprovalRequest(id: string, patch: ApprovalRequestPatch): Promise<void> {
    const req = this.requests.find((r) => r.id === id);
    if (req) Object.assign(req, patch);
  }

  async activateStudent(studentUserId: string): Promise<void> {
    const profile = this.profiles.get(studentUserId);
    if (profile) profile.status = 'active';
    this.users.setStatus(studentUserId, 'active');
  }

  async createOtp(input: CreateOtpInput): Promise<{ id: string }> {
    const record: OtpRecord = {
      id: randomUUID(),
      userId: input.userId,
      channel: input.channel,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      verifiedAt: null,
      attemptCount: 0,
    };
    this.otps.push(record);
    return { id: record.id };
  }

  async findLatestActiveOtp(userId: string, channel: OtpChannel): Promise<OtpRecord | null> {
    const matches = this.otps.filter(
      (o) => o.userId === userId && o.channel === channel && o.verifiedAt === null,
    );
    const latest = matches[matches.length - 1];
    return latest ? { ...latest } : null;
  }

  async markOtpVerified(id: string): Promise<void> {
    const otp = this.otps.find((o) => o.id === id);
    if (otp) otp.verifiedAt = new Date();
  }

  async incrementOtpAttempts(id: string): Promise<void> {
    const otp = this.otps.find((o) => o.id === id);
    if (otp) otp.attemptCount += 1;
  }

  // --- Test-only inspection helpers ---
  profileStatus(studentId: string): string | undefined {
    return this.profiles.get(studentId)?.status;
  }

  approvedLinksFor(studentId: string): LinkParentChildInput[] {
    return this.links.filter((l) => l.studentId === studentId && l.approvedAt !== null);
  }

  requestForStudent(studentId: string): ApprovalRequestRecord | undefined {
    return this.requests.find((r) => r.studentProfileId === studentId);
  }

  otpAttempts(studentId: string): number {
    const otp = this.otps.find((o) => o.userId === studentId);
    return otp?.attemptCount ?? 0;
  }

  expireRequest(studentId: string): void {
    const req = this.requestForStudent(studentId);
    if (req) req.expiresAt = new Date(Date.now() - 1000);
  }

  expireOtp(studentId: string): void {
    const otp = this.otps.find((o) => o.userId === studentId);
    if (otp) otp.expiresAt = new Date(Date.now() - 1000);
  }
}
