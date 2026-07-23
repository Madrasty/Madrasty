import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { optionalAuth, requireAuth, requireRole } from '../auth/auth.middleware';
import { signAccessToken } from '../auth/tokens';
import { errorMiddleware } from '../../lib/error-middleware';
import { ProgramsService } from './programs.service';
import { ChaptersService } from './chapters.service';
import { LessonsService } from './lessons.service';
import { BrowseService } from './browse.service';
import { EnrollmentService } from './enrollment.service';
import { ProgressService } from './progress.service';
import { buildHandlerRegistry } from './lesson-types/registry';
import { createLearningProgramsController } from './learning-programs.controller';
import { InMemoryLearningProgramsRepository } from '../../../test/fakes';

// Mirrors the real router but wired to the in-memory repo.
function buildApp() {
  const repo = new InMemoryLearningProgramsRepository();
  const handlers = buildHandlerRegistry(repo);
  const c = createLearningProgramsController({
    programs: new ProgramsService(repo),
    chapters: new ChaptersService(repo),
    lessons: new LessonsService(repo, handlers),
    browse: new BrowseService(repo, handlers),
    enrollment: new EnrollmentService(repo),
    progress: new ProgressService(repo, handlers),
  });
  const app = express();
  app.use(express.json());
  const teacher = [requireAuth, requireRole('teacher', 'admin')] as const;
  const student = [requireAuth, requireRole('student')] as const;
  app.get('/api/learning-programs/mine', ...teacher, c.listMine);
  app.get('/api/learning-programs/my-programs', ...student, c.listMyPrograms);
  app.post('/api/learning-programs', ...teacher, c.createProgram);
  app.post('/api/learning-programs/:programId/publish', ...teacher, c.publishProgram);
  app.post('/api/learning-programs/:programId/chapters', ...teacher, c.createChapter);
  app.post('/api/learning-programs/:programId/chapters/:chapterId/lessons', ...teacher, c.createLesson);
  app.post(
    '/api/learning-programs/:programId/chapters/:chapterId/lessons/:lessonId/invites',
    ...teacher,
    c.addLessonInvite,
  );
  app.post('/api/learning-programs/:programId/enrollments', ...teacher, c.grantEnrollment);
  app.post('/api/learning-programs/:programId/lessons/:lessonId/open', ...student, c.markLessonOpened);
  app.post(
    '/api/learning-programs/:programId/lessons/:lessonId/complete',
    ...student,
    c.markLessonCompleted,
  );
  app.get('/api/learning-programs', optionalAuth, c.listPublished);
  app.get('/api/learning-programs/:programId', optionalAuth, c.getProgram);
  app.use(errorMiddleware);
  return app;
}

const teacherToken = signAccessToken({ sub: 'teacher-1', role: 'teacher' });
const studentToken = signAccessToken({ sub: 'student-1', role: 'student' });

describe('learning-programs endpoints', () => {
  it('a teacher can author, publish, and the public can browse with gating', async () => {
    const app = buildApp();

    // Create program
    const created = await request(app)
      .post('/api/learning-programs')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: { en: 'Chemistry' }, gradeLevel: 'prep_3', price: 300 });
    expect(created.status).toBe(201);
    const programId = created.body.id;

    // Add a chapter
    const chapter = await request(app)
      .post(`/api/learning-programs/${programId}/chapters`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: { en: 'Atoms' } });
    const chapterId = chapter.body.id;

    // Add a free + a paid published lesson
    await request(app)
      .post(`/api/learning-programs/${programId}/chapters/${chapterId}/lessons`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ lessonType: 'recorded', visibility: 'free', status: 'published', details: { videoUrl: 'https://cdn.example.com/a.mp4' } });
    await request(app)
      .post(`/api/learning-programs/${programId}/chapters/${chapterId}/lessons`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ lessonType: 'recorded', visibility: 'paid', status: 'published', details: { videoUrl: 'https://cdn.example.com/b.mp4' } });

    // Not yet published → hidden from public
    expect((await request(app).get(`/api/learning-programs/${programId}`)).status).toBe(404);

    // Publish, then browse publicly
    await request(app)
      .post(`/api/learning-programs/${programId}/publish`)
      .set('Authorization', `Bearer ${teacherToken}`);

    const list = await request(app).get('/api/learning-programs');
    expect(list.body.programs.map((p: { id: string }) => p.id)).toContain(programId);

    const view = await request(app).get(`/api/learning-programs/${programId}`);
    const all = view.body.chapters.flatMap((c: { lessons: unknown[] }) => c.lessons);
    expect(all).toHaveLength(2);
    const free = all.find((l: { visibility: string }) => l.visibility === 'free');
    const paid = all.find((l: { visibility: string }) => l.visibility === 'paid');
    expect(free.locked).toBe(false);
    expect(free.details.videoUrl).toBe('https://cdn.example.com/a.mp4');
    expect(paid.locked).toBe(true);
    expect(paid.details).toBeNull();
  });

  it('resolves titles by the request locale (?locale= and Accept-Language)', async () => {
    const app = buildApp();
    const created = await request(app)
      .post('/api/learning-programs')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: { ar: 'الكيمياء', en: 'Chemistry' } });
    const programId = created.body.id;
    // The create response already resolves for the request locale (default ar).
    expect(created.body.title).toBe('الكيمياء');

    const chapter = await request(app)
      .post(`/api/learning-programs/${programId}/chapters`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: { ar: 'الذرات', en: 'Atoms' } });
    await request(app)
      .post(`/api/learning-programs/${programId}/chapters/${chapter.body.id}/lessons`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ lessonType: 'pdf', visibility: 'free', status: 'published', title: { ar: 'مقدمة', en: 'Intro' } });
    await request(app)
      .post(`/api/learning-programs/${programId}/publish`)
      .set('Authorization', `Bearer ${teacherToken}`);

    // ?locale=en → English throughout the tree.
    const en = await request(app).get(`/api/learning-programs/${programId}?locale=en`);
    expect(en.body.title).toBe('Chemistry');
    expect(en.body.chapters[0].title).toBe('Atoms');
    expect(en.body.chapters[0].lessons[0].title).toBe('Intro');

    // Accept-Language header → Arabic.
    const ar = await request(app)
      .get(`/api/learning-programs/${programId}`)
      .set('Accept-Language', 'ar-EG,ar;q=0.9');
    expect(ar.body.title).toBe('الكيمياء');
    expect(ar.body.chapters[0].lessons[0].title).toBe('مقدمة');
  });

  it('a student cannot create a program (403)', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/learning-programs')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: { en: 'x' } });
    expect(res.status).toBe(403);
  });

  it('an anonymous user cannot author (401)', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/learning-programs').send({});
    expect(res.status).toBe(401);
  });
});
