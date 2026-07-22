import { z } from 'zod';
import type { LessonTypeHandler } from './handler';
import type { LessonType } from '../types';

// Base for lesson types that have no detail table of their own — they reuse
// another module's tables (quizzes / homework_submissions / exams /
// tutoring_slots+bookings, doc 12 §6). Until those modules exist, these accept a
// lesson but persist no type-specific detail. `delegatesTo` documents the target.
export class StubLessonHandler implements LessonTypeHandler {
  // Accept-and-ignore any details payload for now (passthrough keeps extra keys).
  readonly detailsSchema = z.object({}).passthrough();

  constructor(
    readonly type: LessonType,
    private readonly delegatesTo: string,
  ) {}

  async saveDetails(): Promise<void> {
    // Intentionally no-op — real persistence delegates to ${this.delegatesTo}.
    void this.delegatesTo;
  }

  async getDetails(): Promise<Record<string, unknown> | null> {
    return null;
  }

  async onPublish(): Promise<void> {}

  async onComplete(): Promise<void> {}
}
