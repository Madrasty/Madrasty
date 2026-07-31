import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config/index';
import { MockRtcProvider } from './providers/mock.provider';
import { LiveClassesService, uidFor, type Actor } from './live-classes.service';
import type {
  AttendanceRow,
  AttendanceUpsert,
  LiveClassesRepository,
  LiveLessonRow,
  RuntimePatch,
  StudentGate,
  TranslationRow,
  UserBrief,
} from './live-classes.repository';

// In-memory fake repo (same DI/fake pattern as the other modules).
class FakeRepo implements LiveClassesRepository {
  lessons = new Map<string, LiveLessonRow>();
  attendance: AttendanceRow[] = [];
  gates = new Map<string, StudentGate>();
  enrolled = new Set<string>(); // `${studentId}:${programId}`
  roster = new Map<string, UserBrief[]>(); // programId -> students
  translations: TranslationRow[] = [];
  attendanceTaken = new Set<string>();
  private seq = 0;

  async getLiveLesson(lessonId: string) {
    return this.lessons.get(lessonId) ?? null;
  }
  async listTranslations(entityType: string, entityIds: string[]) {
    return this.translations.filter(
      (row) => row.entityType === entityType && entityIds.includes(row.entityId),
    );
  }
  async listForStudent(studentId: string) {
    return [...this.lessons.values()].filter((l) =>
      this.enrolled.has(`${studentId}:${l.programId}`),
    );
  }
  async listForTeacher(teacherId: string) {
    return [...this.lessons.values()].filter((l) => l.teacherId === teacherId);
  }
  async updateRuntime(lessonId: string, patch: RuntimePatch) {
    const row = this.lessons.get(lessonId);
    if (!row) return;
    if (patch.channelName !== undefined) row.channelName = patch.channelName;
    if (patch.startedAt !== undefined) row.startedAt = patch.startedAt;
    if (patch.endedAt !== undefined) row.endedAt = patch.endedAt;
  }
  async markAttendanceTaken(lessonId: string) {
    this.attendanceTaken.add(lessonId);
  }
  async getStudentGate(studentId: string) {
    return this.gates.get(studentId) ?? { active: false, guardianApproved: false };
  }
  async studentEnrolledIn(studentId: string, programId: string) {
    return this.enrolled.has(`${studentId}:${programId}`);
  }
  async listEnrolledStudents(programId: string) {
    return this.roster.get(programId) ?? [];
  }
  async getAttendance(sessionId: string, studentId: string) {
    return (
      this.attendance.find((a) => a.sessionId === sessionId && a.studentId === studentId) ?? null
    );
  }
  async listAttendance(sessionId: string) {
    return this.attendance.filter((a) => a.sessionId === sessionId);
  }
  async upsertAttendance(input: AttendanceUpsert): Promise<AttendanceRow> {
    const existing = await this.getAttendance(input.sessionId, input.studentId);
    if (existing) {
      existing.status = input.status;
      existing.recordedBy = input.recordedBy ?? null;
      existing.metadata = input.metadata;
      existing.recordedAt = new Date();
      return existing;
    }
    const row: AttendanceRow = {
      id: `att${++this.seq}`,
      studentId: input.studentId,
      sessionType: 'live_class',
      sessionId: input.sessionId,
      status: input.status,
      recordedBy: input.recordedBy ?? null,
      metadata: input.metadata,
      recordedAt: new Date(),
    };
    this.attendance.push(row);
    return row;
  }
}

const TEACHER: Actor = { id: 'teacher-1', role: 'teacher' };
const OTHER_TEACHER: Actor = { id: 'teacher-2', role: 'teacher' };
const STUDENT: Actor = { id: 'student-1', role: 'student' };
const STUDENT_2: Actor = { id: 'student-2', role: 'student' };
const PARENT: Actor = { id: 'parent-1', role: 'parent' };
const ADMIN: Actor = { id: 'admin-1', role: 'admin' };

const LESSON = 'lesson-1';
const PROGRAM = 'program-1';
const LOCALE = 'en';

function lessonRow(overrides: Partial<LiveLessonRow> = {}): LiveLessonRow {
  return {
    lessonId: LESSON,
    chapterId: 'chapter-1',
    programId: PROGRAM,
    teacherId: TEACHER.id,
    lessonStatus: 'published',
    scheduledStart: null,
    scheduledEnd: null,
    meetingUrl: null,
    recordingUrl: null,
    channelName: null,
    startedAt: null,
    endedAt: null,
    ...overrides,
  };
}

describe('LiveClassesService', () => {
  let repo: FakeRepo;
  let service: LiveClassesService;

  beforeEach(() => {
    repo = new FakeRepo();
    service = new LiveClassesService(repo, new MockRtcProvider());

    repo.lessons.set(LESSON, lessonRow());
    repo.gates.set(STUDENT.id, { active: true, guardianApproved: true });
    repo.gates.set(STUDENT_2.id, { active: true, guardianApproved: true });
    repo.enrolled.add(`${STUDENT.id}:${PROGRAM}`);
    repo.enrolled.add(`${STUDENT_2.id}:${PROGRAM}`);
    repo.roster.set(PROGRAM, [
      { id: STUDENT.id, fullName: 'Nour' },
      { id: STUDENT_2.id, fullName: 'Omar' },
    ]);
    repo.translations.push(
      { entityType: 'lesson', entityId: LESSON, locale: 'en', field: 'title', value: 'Live revision' },
      { entityType: 'learning_program', entityId: PROGRAM, locale: 'en', field: 'title', value: 'Algebra I' },
    );
  });

  describe('lifecycle', () => {
    it('starts a class, provisioning a room the client never chose', async () => {
      const view = await service.start(TEACHER, LESSON, LOCALE);

      expect(view.status).toBe('live');
      expect(view.startedAt).not.toBeNull();
      expect(repo.lessons.get(LESSON)!.channelName).toMatch(/^mock-/);
    });

    it('is idempotent — restarting keeps the same room and start time', async () => {
      const first = await service.start(TEACHER, LESSON, LOCALE);
      const channel = repo.lessons.get(LESSON)!.channelName;

      const second = await service.start(TEACHER, LESSON, LOCALE);
      expect(second.startedAt).toBe(first.startedAt);
      expect(repo.lessons.get(LESSON)!.channelName).toBe(channel);
    });

    it('refuses to start someone else’s class', async () => {
      await expect(service.start(OTHER_TEACHER, LESSON, LOCALE)).rejects.toMatchObject({
        code: 'not_your_class',
        statusCode: 403,
      });
    });

    it('refuses to end a class that never started', async () => {
      await expect(service.end(TEACHER, LESSON, LOCALE)).rejects.toMatchObject({
        code: 'class_not_started',
      });
    });

    it('refuses to restart an ended class', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      await service.end(TEACHER, LESSON, LOCALE);
      await expect(service.start(TEACHER, LESSON, LOCALE)).rejects.toMatchObject({
        code: 'class_ended',
      });
    });
  });

  describe('joining', () => {
    it('gives the teacher a host token and no attendance row', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      const result = await service.join(TEACHER, LESSON, LOCALE);

      expect(result.role).toBe('host');
      expect(result.attendance).toBeNull();
      expect(repo.attendance).toHaveLength(0);
      expect(result.credentials.uid).toBe(uidFor(TEACHER.id));
    });

    it('gives a student an audience token and records them present', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      const result = await service.join(STUDENT, LESSON, LOCALE);

      expect(result.role).toBe('audience');
      expect(result.attendance).toMatchObject({ studentId: STUDENT.id, status: 'present' });
      expect(result.credentials.channel).toBe(repo.lessons.get(LESSON)!.channelName);
      expect(result.credentials.token).toBeTruthy();
    });

    it('never lets a student join before the teacher starts', async () => {
      await expect(service.join(STUDENT, LESSON, LOCALE)).rejects.toMatchObject({
        code: 'class_not_started',
      });
      expect(repo.attendance).toHaveLength(0);
    });

    it('refuses to join an ended class', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      await service.end(TEACHER, LESSON, LOCALE);
      await expect(service.join(STUDENT, LESSON, LOCALE)).rejects.toMatchObject({
        code: 'class_ended',
      });
    });

    it('refuses a student who is not enrolled', async () => {
      repo.enrolled.delete(`${STUDENT.id}:${PROGRAM}`);
      await service.start(TEACHER, LESSON, LOCALE);
      await expect(service.join(STUDENT, LESSON, LOCALE)).rejects.toMatchObject({
        code: 'not_enrolled',
        statusCode: 403,
      });
    });

    it('refuses a student whose guardian link is not approved', async () => {
      repo.gates.set(STUDENT.id, { active: true, guardianApproved: false });
      await service.start(TEACHER, LESSON, LOCALE);
      await expect(service.join(STUDENT, LESSON, LOCALE)).rejects.toMatchObject({
        code: 'guardian_approval_required',
      });
    });

    it('refuses a parent — the class is for the enrolled student', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      await expect(service.join(PARENT, LESSON, LOCALE)).rejects.toMatchObject({
        code: 'cannot_join',
      });
    });

    it('marks a student late once the grace period has passed', async () => {
      const longAgo = new Date(
        Date.now() - (config.LIVE_CLASS_LATE_GRACE_MINUTES + 30) * 60_000,
      );
      repo.lessons.set(LESSON, lessonRow({ scheduledStart: longAgo }));
      await service.start(TEACHER, LESSON, LOCALE);

      const result = await service.join(STUDENT, LESSON, LOCALE);
      expect(result.attendance!.status).toBe('late');
    });

    it('rejoining keeps one row and does not downgrade an on-time student', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      await service.join(STUDENT, LESSON, LOCALE);
      await service.leave(STUDENT, LESSON);
      const again = await service.join(STUDENT, LESSON, LOCALE);

      expect(repo.attendance).toHaveLength(1);
      expect(again.attendance!.status).toBe('present');
    });
  });

  describe('attendance', () => {
    it('marks enrolled non-attendees absent when the class ends', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      await service.join(STUDENT, LESSON, LOCALE);
      const roster = await service.end(TEACHER, LESSON, LOCALE);

      const byStudent = new Map(roster.rows.map((r) => [r.student.id, r.attendance]));
      expect(byStudent.get(STUDENT.id)!.status).toBe('present');
      expect(byStudent.get(STUDENT_2.id)!.status).toBe('absent');
      expect(repo.attendanceTaken.has(LESSON)).toBe(true);
    });

    it('records how long a student stayed on leave', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      await service.join(STUDENT, LESSON, LOCALE);
      const left = await service.leave(STUDENT, LESSON);

      expect(left!.lastLeftAt).not.toBeNull();
      expect(left!.minutesPresent).not.toBeNull();
    });

    it('lets the owning teacher override a record, and keeps it overridden on rejoin', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      await service.join(STUDENT, LESSON, LOCALE);

      const overridden = await service.setAttendance(TEACHER, LESSON, {
        studentId: STUDENT.id,
        status: 'absent',
      });
      expect(overridden.status).toBe('absent');
      expect(overridden.overridden).toBe(true);

      // A later automatic join must not silently undo the teacher's correction.
      const rejoined = await service.join(STUDENT, LESSON, LOCALE);
      expect(rejoined.attendance!.status).toBe('absent');
    });

    it('refuses an override for a student outside the program', async () => {
      await expect(
        service.setAttendance(TEACHER, LESSON, { studentId: 'stranger', status: 'present' }),
      ).rejects.toMatchObject({ code: 'student_not_enrolled' });
    });

    it('refuses an override from another teacher', async () => {
      await expect(
        service.setAttendance(OTHER_TEACHER, LESSON, {
          studentId: STUDENT.id,
          status: 'absent',
        }),
      ).rejects.toMatchObject({ code: 'not_your_class' });
    });

    it('shows the register to the owner and an admin, but not to a student', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      await service.join(STUDENT, LESSON, LOCALE);

      expect((await service.getRoster(TEACHER, LESSON, LOCALE)).rows).toHaveLength(2);
      expect((await service.getRoster(ADMIN, LESSON, LOCALE)).rows).toHaveLength(2);
      await expect(service.getRoster(STUDENT, LESSON, LOCALE)).rejects.toMatchObject({
        code: 'not_your_class',
      });
    });
  });

  describe('views', () => {
    it('tells a student why they cannot join yet', async () => {
      const soon = new Date(Date.now() + 60 * 60_000);
      repo.lessons.set(LESSON, lessonRow({ scheduledStart: soon }));

      const view = await service.getLiveClass(STUDENT, LESSON, LOCALE);
      expect(view.canJoin).toBe(false);
      expect(view.joinBlockedReason).toBe('too_early');
      expect(view.joinOpensAt).not.toBeNull();
    });

    it('resolves titles for the requested locale', async () => {
      const view = await service.getLiveClass(TEACHER, LESSON, LOCALE);
      expect(view.title).toBe('Live revision');
      expect(view.programTitle).toBe('Algebra I');
    });

    it('gives the teacher live counts and the student their own record only', async () => {
      await service.start(TEACHER, LESSON, LOCALE);
      await service.join(STUDENT, LESSON, LOCALE);

      const teacherView = await service.getLiveClass(TEACHER, LESSON, LOCALE);
      expect(teacherView.attendanceCounts).toEqual({
        present: 1,
        late: 0,
        absent: 0,
        enrolled: 2,
      });

      const studentView = await service.getLiveClass(STUDENT, LESSON, LOCALE);
      expect(studentView.attendanceCounts).toBeUndefined();
      expect(studentView.myAttendance!.status).toBe('present');
    });

    it('lists a student’s enrolled classes and a teacher’s own', async () => {
      expect((await service.listMine(STUDENT, LOCALE)).classes).toHaveLength(1);
      expect((await service.listMine(TEACHER, LOCALE)).classes).toHaveLength(1);
      expect((await service.listMine(OTHER_TEACHER, LOCALE)).classes).toHaveLength(0);
    });
  });
});
