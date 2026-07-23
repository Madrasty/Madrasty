import { beforeEach, describe, expect, it } from 'vitest';
import { AdminService, type AdminActor } from './admin.service';
import type {
  AdminRepository,
  AuditEntry,
  ProgramRow,
  TeacherRow,
  TranslationRow,
} from './admin.repository';

// In-memory fake of the admin repository.
class FakeRepo implements AdminRepository {
  teachers = new Map<string, TeacherRow>();
  programs = new Map<string, ProgramRow & { teacherId: string }>();
  translations: TranslationRow[] = [];
  audit: AuditEntry[] = [];

  async listTeachersByVerification(status: string) {
    return [...this.teachers.values()].filter((t) => t.verificationStatus === status);
  }
  async getTeacherVerification(userId: string) {
    return this.teachers.get(userId)?.verificationStatus ?? null;
  }
  async setTeacherVerification(userId: string, status: string) {
    this.teachers.get(userId)!.verificationStatus = status;
  }
  async listProgramsByStatus(status: string) {
    return [...this.programs.values()].filter((p) => p.status === status);
  }
  async getProgramStatus(programId: string) {
    const p = this.programs.get(programId);
    return p ? { status: p.status, teacherId: p.teacherId } : null;
  }
  async setProgramStatus(programId: string, status: string) {
    this.programs.get(programId)!.status = status;
  }
  async listProgramTranslations() {
    return this.translations;
  }
  async writeAudit(entry: AuditEntry) {
    this.audit.push(entry);
  }
}

const admin: AdminActor = { id: 'admin-1', role: 'admin' };

describe('admin governance', () => {
  let repo: FakeRepo;
  let service: AdminService;

  beforeEach(() => {
    repo = new FakeRepo();
    service = new AdminService(repo);
    repo.teachers.set('t-pending', {
      userId: 't-pending', fullName: 'Pending Teacher', email: 'p@x.com', phone: null,
      verificationStatus: 'pending', createdAt: new Date(),
    });
    repo.teachers.set('t-verified', {
      userId: 't-verified', fullName: 'Verified Teacher', email: 'v@x.com', phone: null,
      verificationStatus: 'verified', createdAt: new Date(),
    });
    repo.programs.set('prog-1', {
      id: 'prog-1', teacherId: 't-verified', teacherName: 'Verified Teacher',
      gradeLevel: 'Grade 6', priceEgp: '150', status: 'pending_review',
      createdAt: new Date(), updatedAt: new Date(),
    });
    repo.translations.push(
      { entityId: 'prog-1', locale: 'en', field: 'title', value: 'Algebra' },
      { entityId: 'prog-1', locale: 'ar', field: 'title', value: 'الجبر' },
    );
  });

  describe('teacher verification', () => {
    it('lists only teachers in the requested status', async () => {
      const pending = await service.listPendingTeachers('pending');
      expect(pending.map((t) => t.userId)).toEqual(['t-pending']);
    });

    it('verifies a teacher and writes an audit entry', async () => {
      await service.verifyTeacher(admin, 't-pending');
      expect(repo.teachers.get('t-pending')!.verificationStatus).toBe('verified');
      expect(repo.audit).toEqual([
        { actorId: 'admin-1', action: 'teacher.verify', targetType: 'teacher', targetId: 't-pending', metadata: { from: 'pending', to: 'verified' } },
      ]);
    });

    it('rejects a teacher with a reason in the audit trail', async () => {
      await service.rejectTeacher(admin, 't-pending', 'Docs unreadable');
      expect(repo.teachers.get('t-pending')!.verificationStatus).toBe('rejected');
      expect(repo.audit[0]).toMatchObject({ action: 'teacher.reject', metadata: { reason: 'Docs unreadable' } });
    });

    it('404s on an unknown teacher and writes nothing', async () => {
      await expect(service.verifyTeacher(admin, 'nope')).rejects.toMatchObject({
        statusCode: 404, code: 'teacher_not_found',
      });
      expect(repo.audit).toHaveLength(0);
    });
  });

  describe('program approval', () => {
    it('lists submitted programs with the title resolved for the locale', async () => {
      const en = await service.listPendingPrograms('pending_review', 'en');
      expect(en[0]).toMatchObject({ id: 'prog-1', title: 'Algebra', teacherName: 'Verified Teacher' });
      const ar = await service.listPendingPrograms('pending_review', 'ar');
      expect(ar[0].title).toBe('الجبر');
    });

    it('approves a submitted program → published, audited', async () => {
      await service.approveProgram(admin, 'prog-1');
      expect(repo.programs.get('prog-1')!.status).toBe('published');
      expect(repo.audit[0]).toMatchObject({
        action: 'program.approve', targetType: 'program', targetId: 'prog-1',
        metadata: { from: 'pending_review', to: 'published' },
      });
    });

    it('rejects a submitted program → draft with a reason', async () => {
      await service.rejectProgram(admin, 'prog-1', 'Needs more lessons');
      expect(repo.programs.get('prog-1')!.status).toBe('draft');
      expect(repo.audit[0]).toMatchObject({ action: 'program.reject', metadata: { to: 'draft', reason: 'Needs more lessons' } });
    });

    it('refuses to approve a program that is not awaiting review', async () => {
      repo.programs.get('prog-1')!.status = 'draft';
      await expect(service.approveProgram(admin, 'prog-1')).rejects.toMatchObject({
        statusCode: 409, code: 'program_not_in_review',
      });
      expect(repo.audit).toHaveLength(0);
    });

    it('404s on an unknown program', async () => {
      await expect(service.approveProgram(admin, 'ghost')).rejects.toMatchObject({
        statusCode: 404, code: 'program_not_found',
      });
    });
  });
});
