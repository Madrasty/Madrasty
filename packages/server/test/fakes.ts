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
import type {
  ChapterRecord,
  EnrollmentRecord,
  LessonProgressRecord,
  LessonRecord,
  LessonType,
  ProgramRecord,
} from '../src/modules/learning-programs/types';
import type {
  CreateChapterInput,
  CreateEnrollmentInput,
  CreateLessonInput,
  CreateProgramInput,
  LearningProgramsRepository,
  ListPublishedFilter,
  UpdateChapterPatch,
  UpdateLessonPatch,
  UpdateProgramPatch,
} from '../src/modules/learning-programs/learning-programs.repository';

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

// In-memory LearningProgramsRepository — mirrors the Drizzle contract without a
// live Postgres. Soft-deleted rows are excluded from reads.
interface StoredProgram extends ProgramRecord {
  deleted: boolean;
  seq: number;
}
interface StoredChapter extends ChapterRecord {
  deleted: boolean;
}
interface StoredLesson extends LessonRecord {
  deleted: boolean;
}

export class InMemoryLearningProgramsRepository implements LearningProgramsRepository {
  private programs = new Map<string, StoredProgram>();
  private chapters = new Map<string, StoredChapter>();
  private lessons = new Map<string, StoredLesson>();
  private details = new Map<string, Record<string, unknown>>();
  private enrollments: EnrollmentRecord[] = [];
  private progress = new Map<string, LessonProgressRecord>();
  private invites = new Set<string>();
  private seq = 0;

  // --- Programs ---
  async createProgram(input: CreateProgramInput): Promise<ProgramRecord> {
    const record: StoredProgram = {
      id: randomUUID(),
      teacherId: input.teacherId,
      subjectId: input.subjectId ?? null,
      gradeLevel: input.gradeLevel ?? null,
      semester: input.semester ?? null,
      priceEgp: input.priceEgp ?? null,
      status: 'draft',
      metadata: input.metadata ?? {},
      deleted: false,
      seq: this.seq++,
    };
    this.programs.set(record.id, record);
    return this.program(record);
  }

  async getProgramById(id: string): Promise<ProgramRecord | null> {
    const p = this.programs.get(id);
    return p && !p.deleted ? this.program(p) : null;
  }

  async listPublishedPrograms(filter: ListPublishedFilter): Promise<ProgramRecord[]> {
    return [...this.programs.values()]
      .filter(
        (p) =>
          !p.deleted &&
          p.status === 'published' &&
          (!filter.subjectId || p.subjectId === filter.subjectId) &&
          (!filter.gradeLevel || p.gradeLevel === filter.gradeLevel) &&
          (!filter.semester || p.semester === filter.semester),
      )
      .sort((a, b) => a.seq - b.seq)
      .map((p) => this.program(p));
  }

  async listProgramsByTeacher(teacherId: string): Promise<ProgramRecord[]> {
    return [...this.programs.values()]
      .filter((p) => !p.deleted && p.teacherId === teacherId)
      .sort((a, b) => a.seq - b.seq)
      .map((p) => this.program(p));
  }

  async updateProgram(id: string, patch: UpdateProgramPatch): Promise<ProgramRecord | null> {
    const p = this.programs.get(id);
    if (!p || p.deleted) return null;
    Object.assign(p, patch);
    return this.program(p);
  }

  async softDeleteProgram(id: string): Promise<void> {
    const p = this.programs.get(id);
    if (p) p.deleted = true;
  }

  // --- Chapters ---
  async createChapter(input: CreateChapterInput): Promise<ChapterRecord> {
    const record: StoredChapter = {
      id: randomUUID(),
      programId: input.programId,
      orderIndex: input.orderIndex,
      title: input.title ?? null,
      metadata: input.metadata ?? {},
      deleted: false,
    };
    this.chapters.set(record.id, record);
    return this.chapter(record);
  }

  async getChapterById(id: string): Promise<ChapterRecord | null> {
    const c = this.chapters.get(id);
    return c && !c.deleted ? this.chapter(c) : null;
  }

  async listChaptersByProgram(programId: string): Promise<ChapterRecord[]> {
    return [...this.chapters.values()]
      .filter((c) => !c.deleted && c.programId === programId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((c) => this.chapter(c));
  }

  async updateChapter(id: string, patch: UpdateChapterPatch): Promise<ChapterRecord | null> {
    const c = this.chapters.get(id);
    if (!c || c.deleted) return null;
    Object.assign(c, patch);
    return this.chapter(c);
  }

  async softDeleteChapter(id: string): Promise<void> {
    const c = this.chapters.get(id);
    if (c) c.deleted = true;
  }

  // --- Lessons ---
  async createLesson(input: CreateLessonInput): Promise<LessonRecord> {
    const record: StoredLesson = {
      id: randomUUID(),
      chapterId: input.chapterId,
      orderIndex: input.orderIndex,
      lessonType: input.lessonType,
      status: input.status ?? 'draft',
      visibility: input.visibility ?? 'paid',
      prerequisiteLessonId: input.prerequisiteLessonId ?? null,
      metadata: input.metadata ?? {},
      deleted: false,
    };
    this.lessons.set(record.id, record);
    return this.lesson(record);
  }

  async getLessonById(id: string): Promise<LessonRecord | null> {
    const l = this.lessons.get(id);
    return l && !l.deleted ? this.lesson(l) : null;
  }

  async listLessonsByChapter(chapterId: string): Promise<LessonRecord[]> {
    return [...this.lessons.values()]
      .filter((l) => !l.deleted && l.chapterId === chapterId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((l) => this.lesson(l));
  }

  async updateLesson(id: string, patch: UpdateLessonPatch): Promise<LessonRecord | null> {
    const l = this.lessons.get(id);
    if (!l || l.deleted) return null;
    Object.assign(l, patch);
    return this.lesson(l);
  }

  async softDeleteLesson(id: string): Promise<void> {
    const l = this.lessons.get(id);
    if (l) l.deleted = true;
  }

  // --- Lesson detail store ---
  async upsertDetails(
    type: LessonType,
    lessonId: string,
    row: Record<string, unknown>,
  ): Promise<void> {
    this.details.set(`${type}:${lessonId}`, { lessonId, ...row });
  }

  async getDetails(type: LessonType, lessonId: string): Promise<Record<string, unknown> | null> {
    return this.details.get(`${type}:${lessonId}`) ?? null;
  }

  // --- Enrollment ---
  async createEnrollment(input: CreateEnrollmentInput): Promise<EnrollmentRecord> {
    const record: EnrollmentRecord = {
      id: randomUUID(),
      studentId: input.studentId,
      programId: input.programId,
      source: input.source,
      status: 'active',
      grantedAt: new Date(),
      expiresAt: input.expiresAt ?? null,
    };
    this.enrollments.push(record);
    return { ...record };
  }

  private isActive(e: EnrollmentRecord, now: Date): boolean {
    return e.status === 'active' && (e.expiresAt === null || e.expiresAt.getTime() > now.getTime());
  }

  async findActiveEnrollment(
    studentId: string,
    programId: string,
    now: Date,
  ): Promise<EnrollmentRecord | null> {
    const matches = this.enrollments
      .filter((e) => e.studentId === studentId && e.programId === programId && this.isActive(e, now))
      .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime());
    return matches[0] ? { ...matches[0] } : null;
  }

  async listActiveEnrollmentsByStudent(
    studentId: string,
    now: Date,
  ): Promise<EnrollmentRecord[]> {
    return this.enrollments
      .filter((e) => e.studentId === studentId && this.isActive(e, now))
      .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime())
      .map((e) => ({ ...e }));
  }

  async getProgramsByIds(ids: string[]): Promise<ProgramRecord[]> {
    const set = new Set(ids);
    return [...this.programs.values()]
      .filter((p) => !p.deleted && set.has(p.id))
      .map((p) => this.program(p));
  }

  // --- Lesson progress ---
  async upsertLessonOpened(
    studentId: string,
    lessonId: string,
    now: Date,
  ): Promise<LessonProgressRecord> {
    const key = `${studentId}:${lessonId}`;
    const existing = this.progress.get(key);
    if (existing) {
      if (!existing.openedAt) existing.openedAt = now;
      return { ...existing };
    }
    const record: LessonProgressRecord = {
      studentId,
      lessonId,
      openedAt: now,
      completedAt: null,
      metadata: {},
    };
    this.progress.set(key, record);
    return { ...record };
  }

  async markLessonCompleted(
    studentId: string,
    lessonId: string,
    now: Date,
  ): Promise<LessonProgressRecord> {
    const key = `${studentId}:${lessonId}`;
    const existing = this.progress.get(key);
    if (existing) {
      existing.completedAt = now;
      if (!existing.openedAt) existing.openedAt = now;
      return { ...existing };
    }
    const record: LessonProgressRecord = {
      studentId,
      lessonId,
      openedAt: now,
      completedAt: now,
      metadata: {},
    };
    this.progress.set(key, record);
    return { ...record };
  }

  async isLessonCompleted(studentId: string, lessonId: string): Promise<boolean> {
    return this.progress.get(`${studentId}:${lessonId}`)?.completedAt != null;
  }

  // --- Lesson invites ---
  async addLessonInvite(lessonId: string, studentId: string): Promise<void> {
    this.invites.add(`${lessonId}:${studentId}`);
  }

  async isLessonInvited(lessonId: string, studentId: string): Promise<boolean> {
    return this.invites.has(`${lessonId}:${studentId}`);
  }

  // Return copies so callers can't mutate internal state.
  private program(p: StoredProgram): ProgramRecord {
    return {
      id: p.id,
      teacherId: p.teacherId,
      subjectId: p.subjectId,
      gradeLevel: p.gradeLevel,
      semester: p.semester,
      priceEgp: p.priceEgp,
      status: p.status,
      metadata: { ...p.metadata },
    };
  }
  private chapter(c: StoredChapter): ChapterRecord {
    return {
      id: c.id,
      programId: c.programId,
      orderIndex: c.orderIndex,
      title: c.title,
      metadata: { ...c.metadata },
    };
  }
  private lesson(l: StoredLesson): LessonRecord {
    return {
      id: l.id,
      chapterId: l.chapterId,
      orderIndex: l.orderIndex,
      lessonType: l.lessonType,
      status: l.status,
      visibility: l.visibility,
      prerequisiteLessonId: l.prerequisiteLessonId,
      metadata: { ...l.metadata },
    };
  }
}
