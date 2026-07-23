import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config/index';
import { ProgramsService } from './programs.service';
import { ChaptersService } from './chapters.service';
import { LessonsService } from './lessons.service';
import { BrowseService } from './browse.service';
import { buildHandlerRegistry } from './lesson-types/registry';
import type { Actor, Viewer } from './types';
import { InMemoryLearningProgramsRepository } from '../../../test/fakes';

const teacher: Actor = { id: 'teacher-1', role: 'teacher' };
const ownerViewer: Viewer = { userId: teacher.id, role: 'teacher' };

// DEFAULT_LOCALE from env (.env sets it to 'ar'); assert against config so the
// fallback tests stay correct if the default is ever changed.
const DEFAULT = config.DEFAULT_LOCALE;
const OTHER = DEFAULT === 'ar' ? 'en' : 'ar';

// Build a { ar?, en? } localized value for a single locale (keeps the tests
// robust to which locale is the platform default).
function loc(locale: string, value: string): { ar?: string; en?: string } {
  return locale === 'ar' ? { ar: value } : { en: value };
}

describe('translations table wiring for learning-programs', () => {
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

  it('writes titles/descriptions to the translations table, not metadata', async () => {
    const p = await programs.create(teacher, {
      title: { ar: 'الرياضيات', en: 'Mathematics' },
      description: { ar: 'وصف', en: 'A description' },
      metadata: { internalNote: 'keep' },
    });
    // Nothing localized leaked into metadata; other metadata is preserved.
    expect(p.metadata.title).toBeUndefined();
    expect(p.metadata.description).toBeUndefined();
    expect(p.metadata.internalNote).toBe('keep');

    // The translations store holds one row per (locale, field).
    const rows = await repo.listTranslations('learning_program', [p.id]);
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual({
      entityType: 'learning_program',
      entityId: p.id,
      locale: 'ar',
      field: 'title',
      value: 'الرياضيات',
    });
    expect(rows).toContainEqual({
      entityType: 'learning_program',
      entityId: p.id,
      locale: 'en',
      field: 'title',
      value: 'Mathematics',
    });
  });

  it('reads a program back in each locale (create in ar+en)', async () => {
    const created = await programs.create(teacher, {
      title: { ar: 'الفيزياء', en: 'Physics' },
      description: { ar: 'مادة الفيزياء', en: 'The physics subject' },
    });
    await programs.publish(teacher, created.id);

    const ar = await browse.getProgramContent(created.id, ownerViewer, 'ar');
    expect(ar.title).toBe('الفيزياء');
    expect(ar.description).toBe('مادة الفيزياء');

    const en = await browse.getProgramContent(created.id, ownerViewer, 'en');
    expect(en.title).toBe('Physics');
    expect(en.description).toBe('The physics subject');
  });

  it('resolves chapter + lesson titles per locale within the program tree', async () => {
    const p = await programs.create(teacher, { title: { ar: 'برنامج', en: 'Program' } });
    const chapter = await chapters.create(teacher, p.id, {
      title: { ar: 'الفصل الأول', en: 'Chapter One' },
    });
    await lessons.create(teacher, p.id, chapter.id, {
      lessonType: 'recorded',
      status: 'published',
      visibility: 'free',
      title: { ar: 'الدرس', en: 'The Lesson' },
      description: { ar: 'شرح', en: 'Explanation' },
    });
    await programs.publish(teacher, p.id);

    const en = await browse.getProgramContent(p.id, ownerViewer, 'en');
    expect(en.chapters[0].title).toBe('Chapter One');
    expect(en.chapters[0].lessons[0].title).toBe('The Lesson');
    expect(en.chapters[0].lessons[0].description).toBe('Explanation');

    const ar = await browse.getProgramContent(p.id, ownerViewer, 'ar');
    expect(ar.chapters[0].title).toBe('الفصل الأول');
    expect(ar.chapters[0].lessons[0].title).toBe('الدرس');
  });

  it('falls back to DEFAULT_LOCALE when the requested locale is missing', async () => {
    // Provide only the DEFAULT locale; request the OTHER locale → fall back.
    const created = await programs.create(teacher, {
      title: loc(DEFAULT, 'default-title'),
      description: loc(DEFAULT, 'default-desc'),
    });
    await programs.publish(teacher, created.id);

    const view = await browse.getProgramContent(created.id, ownerViewer, OTHER);
    expect(view.title).toBe('default-title');
    expect(view.description).toBe('default-desc');
  });

  it('returns null for a field with no translation in the requested or default locale', async () => {
    // Provide a title only in OTHER (non-default) locale, then read the DEFAULT
    // locale: no match in requested (DEFAULT) and no default row → null.
    const created = await programs.create(teacher, { title: loc(OTHER, 'only-other') });
    await programs.publish(teacher, created.id);

    const view = await browse.getProgramContent(created.id, ownerViewer, DEFAULT);
    expect(view.title).toBeNull();
    // But requesting OTHER still resolves it.
    const other = await browse.getProgramContent(created.id, ownerViewer, OTHER);
    expect(other.title).toBe('only-other');
  });

  it('merges translations across updates (update only touches provided locales)', async () => {
    const created = await programs.create(teacher, { title: { en: 'Only EN' } });
    // Add the Arabic title in a later update — English must remain.
    await programs.update(teacher, created.id, { title: { ar: 'عربي فقط' } });

    const rows = await repo.listTranslations('learning_program', [created.id]);
    const titles = rows.filter((r) => r.field === 'title');
    expect(titles).toHaveLength(2);
    expect(titles.find((r) => r.locale === 'en')?.value).toBe('Only EN');
    expect(titles.find((r) => r.locale === 'ar')?.value).toBe('عربي فقط');
  });
});
