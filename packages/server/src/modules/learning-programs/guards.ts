import { HttpError } from '../../lib/http-error';
import { assertCanEditProgram } from './authorization';
import type { LearningProgramsRepository } from './learning-programs.repository';
import type { Actor, ChapterRecord, LessonRecord, ProgramRecord } from './types';

// Loads a program and asserts the actor may edit it (owner teacher or admin).
export async function loadEditableProgram(
  repo: LearningProgramsRepository,
  actor: Actor,
  programId: string,
): Promise<ProgramRecord> {
  const program = await repo.getProgramById(programId);
  if (!program) {
    throw HttpError.notFound('program_not_found', 'Program not found.');
  }
  assertCanEditProgram(program, actor);
  return program;
}

// Loads a chapter and confirms it belongs to the given program.
export async function loadChapterInProgram(
  repo: LearningProgramsRepository,
  programId: string,
  chapterId: string,
): Promise<ChapterRecord> {
  const chapter = await repo.getChapterById(chapterId);
  if (!chapter || chapter.programId !== programId) {
    throw HttpError.notFound('chapter_not_found', 'Chapter not found in this program.');
  }
  return chapter;
}

// Loads a lesson and confirms it belongs to the given chapter.
export async function loadLessonInChapter(
  repo: LearningProgramsRepository,
  chapterId: string,
  lessonId: string,
): Promise<LessonRecord> {
  const lesson = await repo.getLessonById(lessonId);
  if (!lesson || lesson.chapterId !== chapterId) {
    throw HttpError.notFound('lesson_not_found', 'Lesson not found in this chapter.');
  }
  return lesson;
}

// Loads a lesson via its chapter and confirms both belong to the given program.
// Used by student progress endpoints that address a lesson by program + lesson id
// (no chapter in the path).
export async function loadLessonInProgram(
  repo: LearningProgramsRepository,
  programId: string,
  lessonId: string,
): Promise<{ program: ProgramRecord; lesson: LessonRecord }> {
  const lesson = await repo.getLessonById(lessonId);
  const chapter = lesson ? await repo.getChapterById(lesson.chapterId) : null;
  if (!lesson || !chapter || chapter.programId !== programId) {
    throw HttpError.notFound('lesson_not_found', 'Lesson not found in this program.');
  }
  const program = await repo.getProgramById(programId);
  if (!program) {
    throw HttpError.notFound('program_not_found', 'Program not found.');
  }
  return { program, lesson };
}
