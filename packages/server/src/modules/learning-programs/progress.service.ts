import { HttpError } from '../../lib/http-error';
import type { LearningProgramsRepository } from './learning-programs.repository';
import { getHandler, type LessonHandlerRegistry } from './lesson-types/handler';
import { resolveLessonAccess } from './access';
import { loadLessonInProgram } from './guards';
import type { Actor, LessonProgressRecord, LessonRecord } from './types';

// Student-facing lesson progress (doc 12 §8). A student may only record progress
// on a lesson they can actually access — the same gating browsing applies.
export class ProgressService {
  constructor(
    private readonly repo: LearningProgramsRepository,
    private readonly handlers: LessonHandlerRegistry,
  ) {}

  async markOpened(
    student: Actor,
    programId: string,
    lessonId: string,
  ): Promise<LessonProgressRecord> {
    const lesson = await this.loadAccessibleLesson(student, programId, lessonId);
    return this.repo.upsertLessonOpened(student.id, lesson.id, new Date());
  }

  async markCompleted(
    student: Actor,
    programId: string,
    lessonId: string,
  ): Promise<LessonProgressRecord> {
    const lesson = await this.loadAccessibleLesson(student, programId, lessonId);
    const progress = await this.repo.markLessonCompleted(student.id, lesson.id, new Date());
    // Fire the lesson-type hook (doc 12 §10) — e.g. later this drives progress
    // roll-ups / certificates. Recorded/live/etc. handlers currently no-op.
    await getHandler(this.handlers, lesson.lessonType).onComplete(lesson.id, student.id);
    return progress;
  }

  private async loadAccessibleLesson(
    student: Actor,
    programId: string,
    lessonId: string,
  ): Promise<LessonRecord> {
    const { lesson } = await loadLessonInProgram(this.repo, programId, lessonId);
    // Students only ever act on published lessons; drafts stay hidden.
    if (lesson.status !== 'published') {
      throw HttpError.notFound('lesson_not_found', 'Lesson not found in this program.');
    }
    const enrolled =
      (await this.repo.findActiveEnrollment(student.id, programId, new Date())) !== null;
    const canAccess = await resolveLessonAccess(
      this.repo,
      lesson,
      { userId: student.id, role: student.role },
      { ownerOrAdmin: false, enrolled },
    );
    if (!canAccess) {
      throw HttpError.forbidden('lesson_locked', 'You do not have access to this lesson.');
    }
    return lesson;
  }
}
