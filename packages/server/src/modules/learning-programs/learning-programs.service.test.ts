import { beforeEach, describe, expect, it } from 'vitest';
import { ProgramsService } from './programs.service';
import { ChaptersService } from './chapters.service';
import { LessonsService } from './lessons.service';
import { BrowseService } from './browse.service';
import { buildHandlerRegistry } from './lesson-types/registry';
import type { Actor, Viewer } from './types';
import { InMemoryLearningProgramsRepository } from '../../../test/fakes';

const teacher: Actor = { id: 'teacher-1', role: 'teacher' };
const otherTeacher: Actor = { id: 'teacher-2', role: 'teacher' };
const admin: Actor = { id: 'admin-1', role: 'admin' };

const publicViewer: Viewer = { userId: null, role: null };
const ownerViewer: Viewer = { userId: teacher.id, role: 'teacher' };

describe('learning-programs services', () => {
  let repo: InMemoryLearningProgramsRepository;
  let programs: ProgramsService;
  let chapters: ChaptersService;
  let lessons: LessonsService;
  let browse: BrowseService;

  beforeEach(() => {
    repo = new InMemoryLearningProgramsRepository();
    const handlers = buildHandlerRegistry(repo);
    programs = new ProgramsService(repo);
    chapters = new ChaptersService(repo);
    lessons = new LessonsService(repo, handlers);
    browse = new BrowseService(repo, handlers);
  });

  describe('programs CRUD + RBAC', () => {
    it('creates a draft program owned by the acting teacher', async () => {
      const p = await programs.create(teacher, { title: { en: 'Algebra' }, price: 500 }, 'en');
      expect(p.teacherId).toBe(teacher.id);
      expect(p.status).toBe('draft');
      expect(p.priceEgp).toBe('500');
      // Title now resolves from the translations table, not metadata (doc 12 §6).
      expect(p.title).toBe('Algebra');
      expect(p.metadata.title).toBeUndefined();
    });

    it('forbids a different teacher from editing the program', async () => {
      const p = await programs.create(teacher, {});
      await expect(programs.update(otherTeacher, p.id, { semester: 'S1' })).rejects.toMatchObject({
        statusCode: 403,
        code: 'not_program_owner',
      });
    });

    it('lets an admin edit any program', async () => {
      const p = await programs.create(teacher, {});
      const updated = await programs.update(admin, p.id, { gradeLevel: 'prep_2' });
      expect(updated.gradeLevel).toBe('prep_2');
    });

    it('publishes and soft-deletes', async () => {
      const p = await programs.create(teacher, {});
      expect((await programs.publish(teacher, p.id)).status).toBe('published');
      await programs.remove(teacher, p.id);
      expect(await repo.getProgramById(p.id)).toBeNull();
    });

    it('404s editing a missing program', async () => {
      await expect(programs.update(teacher, 'nope', {})).rejects.toMatchObject({
        statusCode: 404,
        code: 'program_not_found',
      });
    });
  });

  describe('chapters ordering', () => {
    it('appends chapters with increasing order_index by default', async () => {
      const p = await programs.create(teacher, {});
      const c0 = await chapters.create(teacher, p.id, { title: { en: 'One' } });
      const c1 = await chapters.create(teacher, p.id, { title: { en: 'Two' } });
      expect(c0.orderIndex).toBe(0);
      expect(c1.orderIndex).toBe(1);
      const list = await repo.listChaptersByProgram(p.id);
      expect(list.map((c) => c.id)).toEqual([c0.id, c1.id]);
    });
  });

  describe('lessons + type handlers', () => {
    async function programWithChapter() {
      const p = await programs.create(teacher, {});
      const c = await chapters.create(teacher, p.id, {});
      return { programId: p.id, chapterId: c.id };
    }

    it('creates a recorded lesson and persists its type-specific details', async () => {
      const { programId, chapterId } = await programWithChapter();
      const { lesson, details } = await lessons.create(teacher, programId, chapterId, {
        lessonType: 'recorded',
        visibility: 'free',
        details: { videoUrl: 'https://cdn.example.com/v.mp4', durationSeconds: 600 },
      });
      expect(lesson.lessonType).toBe('recorded');
      expect(details).toMatchObject({ videoUrl: 'https://cdn.example.com/v.mp4', durationSeconds: 600 });
    });

    it('rejects invalid type-specific details without creating an orphan lesson', async () => {
      const { programId, chapterId } = await programWithChapter();
      await expect(
        lessons.create(teacher, programId, chapterId, {
          lessonType: 'recorded',
          details: { videoUrl: 'not-a-url' },
        }),
      ).rejects.toBeTruthy();
      // No lesson row was created.
      expect(await repo.listLessonsByChapter(chapterId)).toHaveLength(0);
    });

    it('creates a quiz lesson (stub type) with no detail row', async () => {
      const { programId, chapterId } = await programWithChapter();
      const { lesson, details } = await lessons.create(teacher, programId, chapterId, {
        lessonType: 'quiz',
      });
      expect(lesson.lessonType).toBe('quiz');
      expect(details).toBeNull();
    });

    it('publishing a lesson flips its status to published', async () => {
      const { programId, chapterId } = await programWithChapter();
      const { lesson } = await lessons.create(teacher, programId, chapterId, { lessonType: 'pdf' });
      const published = await lessons.publish(teacher, programId, chapterId, lesson.id);
      expect(published.status).toBe('published');
    });

    it('forbids a non-owner from adding lessons', async () => {
      const { programId, chapterId } = await programWithChapter();
      await expect(
        lessons.create(otherTeacher, programId, chapterId, { lessonType: 'pdf' }),
      ).rejects.toMatchObject({ code: 'not_program_owner' });
    });
  });

  describe('public browsing + visibility gating', () => {
    // A published program: free published lesson, paid published lesson, and a
    // draft lesson (should be hidden from the public).
    async function seedProgram() {
      const p = await programs.create(teacher, { title: { en: 'Physics' } });
      const c = await chapters.create(teacher, p.id, { title: { en: 'Motion' } });
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
      await lessons.create(teacher, p.id, c.id, {
        lessonType: 'pdf',
        visibility: 'free',
        status: 'draft',
      });
      await programs.publish(teacher, p.id);
      return { programId: p.id, freeId: free.lesson.id, paidId: paid.lesson.id };
    }

    it('lists only published programs', async () => {
      await programs.create(teacher, {}); // stays draft
      const { programId } = await seedProgram();
      const list = await browse.listPublished({});
      expect(list.map((p) => p.id)).toEqual([programId]);
    });

    it('shows free lesson details but locks paid lessons for the public', async () => {
      const { programId, freeId, paidId } = await seedProgram();
      const view = await browse.getProgramContent(programId, publicViewer);
      const all = view.chapters.flatMap((c) => c.lessons);

      // Draft lesson hidden → only the 2 published lessons are visible.
      expect(all).toHaveLength(2);
      const free = all.find((l) => l.id === freeId)!;
      const paid = all.find((l) => l.id === paidId)!;
      expect(free.locked).toBe(false);
      expect(free.details).toMatchObject({ videoUrl: 'https://cdn.example.com/free.mp4' });
      expect(paid.locked).toBe(true);
      expect(paid.details).toBeNull();
    });

    it('reveals everything (incl. drafts + paid details) to the owner', async () => {
      const { programId, paidId } = await seedProgram();
      const view = await browse.getProgramContent(programId, ownerViewer);
      const all = view.chapters.flatMap((c) => c.lessons);
      expect(all).toHaveLength(3); // draft included
      const paid = all.find((l) => l.id === paidId)!;
      expect(paid.locked).toBe(false);
      expect(paid.details).toMatchObject({ videoUrl: 'https://cdn.example.com/paid.mp4' });
    });

    it('hides an unpublished program from the public but shows it to the owner', async () => {
      const p = await programs.create(teacher, {});
      await expect(browse.getProgramContent(p.id, publicViewer)).rejects.toMatchObject({
        statusCode: 404,
      });
      const view = await browse.getProgramContent(p.id, ownerViewer);
      expect(view.id).toBe(p.id);
    });
  });
});
