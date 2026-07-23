import { beforeEach, describe, expect, it } from 'vitest';
import { ProgramsService } from './programs.service';
import { ChaptersService } from './chapters.service';
import { LessonsService } from './lessons.service';
import { BrowseService, type ProgramContentView } from './browse.service';
import { EnrollmentService } from './enrollment.service';
import { ProgressService } from './progress.service';
import { buildHandlerRegistry } from './lesson-types/registry';
import type { Actor, Viewer } from './types';
import { InMemoryLearningProgramsRepository } from '../../../test/fakes';

const teacher: Actor = { id: 'teacher-1', role: 'teacher' };
const admin: Actor = { id: 'admin-1', role: 'admin' };
const student: Actor = { id: 'student-1', role: 'student' };
const otherStudent: Actor = { id: 'student-2', role: 'student' };

const studentViewer: Viewer = { userId: student.id, role: 'student' };

// Finds a lesson in a fetched program tree by id.
function findLesson(view: ProgramContentView, id: string) {
  return view.chapters.flatMap((c) => c.lessons).find((l) => l.id === id);
}

describe('enrollment + access gating', () => {
  let repo: InMemoryLearningProgramsRepository;
  let programs: ProgramsService;
  let chapters: ChaptersService;
  let lessons: LessonsService;
  let browse: BrowseService;
  let enrollment: EnrollmentService;
  let progress: ProgressService;

  beforeEach(() => {
    repo = new InMemoryLearningProgramsRepository();
    const handlers = buildHandlerRegistry(repo);
    programs = new ProgramsService(repo);
    chapters = new ChaptersService(repo);
    lessons = new LessonsService(repo, handlers);
    browse = new BrowseService(repo, handlers);
    enrollment = new EnrollmentService(repo);
    progress = new ProgressService(repo, handlers);
  });

  // A published program: free, paid, locked (prereq = the paid lesson), and an
  // invite-only lesson — all published.
  async function seed() {
    const p = await programs.create(teacher, { title: { en: 'Biology' } });
    const c = await chapters.create(teacher, p.id, { title: { en: 'Cells' } });
    const free = await lessons.create(teacher, p.id, c.id, {
      lessonType: 'recorded',
      visibility: 'free',
      status: 'published',
      details: { videoUrl: 'https://cdn.example.com/free.mp4' },
    });
    const paid = await lessons.create(teacher, p.id, c.id, {
      lessonType: 'recorded',
      visibility: 'paid',
      status: 'published',
      details: { videoUrl: 'https://cdn.example.com/paid.mp4' },
    });
    const locked = await lessons.create(teacher, p.id, c.id, {
      lessonType: 'recorded',
      visibility: 'locked',
      status: 'published',
      prerequisiteLessonId: paid.lesson.id,
      details: { videoUrl: 'https://cdn.example.com/locked.mp4' },
    });
    const invite = await lessons.create(teacher, p.id, c.id, {
      lessonType: 'recorded',
      visibility: 'invite_only',
      status: 'published',
      details: { videoUrl: 'https://cdn.example.com/invite.mp4' },
    });
    await programs.publish(teacher, p.id);
    return {
      programId: p.id,
      chapterId: c.id,
      freeId: free.lesson.id,
      paidId: paid.lesson.id,
      lockedId: locked.lesson.id,
      inviteId: invite.lesson.id,
    };
  }

  describe('free access', () => {
    it('exposes free lesson details to an unenrolled student', async () => {
      const { programId, freeId } = await seed();
      const view = await browse.getProgramContent(programId, studentViewer);
      const free = findLesson(view, freeId)!;
      expect(free.locked).toBe(false);
      expect(free.details).toMatchObject({ videoUrl: 'https://cdn.example.com/free.mp4' });
    });

    it('lets an unenrolled student mark a free lesson opened + completed', async () => {
      const { programId, freeId } = await seed();
      const opened = await progress.markOpened(student, programId, freeId);
      expect(opened.openedAt).toBeInstanceOf(Date);
      const completed = await progress.markCompleted(student, programId, freeId);
      expect(completed.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('paid gating', () => {
    it('locks a paid lesson for a student with no enrollment', async () => {
      const { programId, paidId } = await seed();
      const view = await browse.getProgramContent(programId, studentViewer);
      const paid = findLesson(view, paidId)!;
      expect(paid.locked).toBe(true);
      expect(paid.details).toBeNull();
    });

    it('rejects progress on a paid lesson without enrollment (403 lesson_locked)', async () => {
      const { programId, paidId } = await seed();
      await expect(progress.markOpened(student, programId, paidId)).rejects.toMatchObject({
        statusCode: 403,
        code: 'lesson_locked',
      });
    });

    it('unlocks the paid lesson once the student is enrolled', async () => {
      const { programId, paidId } = await seed();
      await enrollment.grant(teacher, programId, { studentId: student.id });
      const view = await browse.getProgramContent(programId, studentViewer);
      const paid = findLesson(view, paidId)!;
      expect(paid.locked).toBe(false);
      expect(paid.details).toMatchObject({ videoUrl: 'https://cdn.example.com/paid.mp4' });
    });

    it('does not leak one student’s enrollment to another student', async () => {
      const { programId, paidId } = await seed();
      await enrollment.grant(admin, programId, { studentId: student.id });
      const view = await browse.getProgramContent(programId, {
        userId: otherStudent.id,
        role: 'student',
      });
      expect(findLesson(view, paidId)!.locked).toBe(true);
    });

    it('re-locks a paid lesson after the enrollment has expired', async () => {
      const { programId, paidId } = await seed();
      await enrollment.grant(teacher, programId, {
        studentId: student.id,
        expiresAt: new Date(Date.now() - 1000), // already expired
      });
      const view = await browse.getProgramContent(programId, studentViewer);
      expect(findLesson(view, paidId)!.locked).toBe(true);
    });
  });

  describe('prerequisite unlock', () => {
    it('keeps a locked lesson gated for an enrolled student until the prerequisite is completed', async () => {
      const { programId, paidId, lockedId } = await seed();
      await enrollment.grant(teacher, programId, { studentId: student.id });

      // Enrolled but prerequisite not yet completed → still locked.
      let view = await browse.getProgramContent(programId, studentViewer);
      expect(findLesson(view, lockedId)!.locked).toBe(true);

      // Complete the prerequisite (the paid lesson) → the locked lesson unlocks.
      await progress.markCompleted(student, programId, paidId);
      view = await browse.getProgramContent(programId, studentViewer);
      const locked = findLesson(view, lockedId)!;
      expect(locked.locked).toBe(false);
      expect(locked.details).toMatchObject({ videoUrl: 'https://cdn.example.com/locked.mp4' });
    });

    it('does not unlock a locked lesson from completion alone without enrollment', async () => {
      const { programId, paidId, lockedId } = await seed();
      // Force-complete the prerequisite without enrollment (repo-level) to prove
      // the gate still requires an active enrollment, not just completion.
      await repo.markLessonCompleted(student.id, paidId, new Date());
      const view = await browse.getProgramContent(programId, studentViewer);
      expect(findLesson(view, lockedId)!.locked).toBe(true);
    });
  });

  describe('invite_only', () => {
    it('locks an invite-only lesson for a student who is not invited', async () => {
      const { programId, inviteId } = await seed();
      await enrollment.grant(teacher, programId, { studentId: student.id });
      const view = await browse.getProgramContent(programId, studentViewer);
      expect(findLesson(view, inviteId)!.locked).toBe(true);
    });

    it('unlocks an invite-only lesson once the student is on the invite list', async () => {
      const { programId, chapterId, inviteId } = await seed();
      await lessons.invite(teacher, programId, chapterId, inviteId, student.id);
      const view = await browse.getProgramContent(programId, studentViewer);
      const invite = findLesson(view, inviteId)!;
      expect(invite.locked).toBe(false);
      expect(invite.details).toMatchObject({ videoUrl: 'https://cdn.example.com/invite.mp4' });
    });
  });

  describe('my-programs + grant RBAC', () => {
    it('lists a student’s enrolled programs', async () => {
      const { programId } = await seed();
      expect(await enrollment.listMyPrograms(student.id)).toHaveLength(0);
      await enrollment.grant(teacher, programId, { studentId: student.id, source: 'admin_grant' });
      const mine = await enrollment.listMyPrograms(student.id);
      expect(mine).toHaveLength(1);
      expect(mine[0].id).toBe(programId);
      expect(mine[0].enrollment.source).toBe('admin_grant');
    });

    it('forbids a non-owner teacher from granting enrollment', async () => {
      const { programId } = await seed();
      const otherTeacher: Actor = { id: 'teacher-9', role: 'teacher' };
      await expect(
        enrollment.grant(otherTeacher, programId, { studentId: student.id }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'not_program_owner' });
    });
  });
});
