import type { ZodTypeAny } from 'zod';
import type { LessonRecord, LessonType } from '../types';

// One interface, many implementations — the same "provider" pattern used for
// payments (doc 04) and SMS. Adding a future lesson type (AI Tutor, Virtual Lab,
// doc 12 §4) means writing one handler, never touching lessons.service.ts.
export interface LessonTypeHandler {
  readonly type: LessonType;

  // Zod schema for this type's `details` payload. Types without extra structured
  // fields (quiz/homework/exam/private_session, for now) accept an empty object.
  readonly detailsSchema: ZodTypeAny;

  // Persist the type-specific detail row (upsert). `details` is already validated
  // against detailsSchema by the caller.
  saveDetails(lessonId: string, details: unknown): Promise<void>;

  // Fetch the type-specific detail row, or null if none / not applicable.
  getDetails(lessonId: string): Promise<Record<string, unknown> | null>;

  // Lifecycle hooks (doc 12 §10). Kept minimal now; real integrations (creating a
  // meeting room, wiring a quiz, etc.) land in the respective modules later.
  onPublish(lesson: LessonRecord): Promise<void>;
  onComplete(lessonId: string, studentId: string): Promise<void>;
}

// Registry keyed by lesson_type. lessons.service resolves the handler by type
// rather than branching on it.
export type LessonHandlerRegistry = Record<LessonType, LessonTypeHandler>;

export function getHandler(registry: LessonHandlerRegistry, type: LessonType): LessonTypeHandler {
  const handler = registry[type];
  if (!handler) {
    throw new Error(`No handler registered for lesson type "${type}".`);
  }
  return handler;
}
