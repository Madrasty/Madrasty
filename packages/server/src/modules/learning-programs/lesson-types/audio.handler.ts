import { z } from 'zod';
import type { LessonTypeHandler } from './handler';
import type { LessonDetailsStore } from '../learning-programs.repository';

const audioDetailsSchema = z.object({
  audioUrl: z.string().url().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
});

export class AudioLessonHandler implements LessonTypeHandler {
  readonly type = 'audio' as const;
  readonly detailsSchema = audioDetailsSchema;

  constructor(private readonly store: LessonDetailsStore) {}

  async saveDetails(lessonId: string, details: unknown): Promise<void> {
    const d = audioDetailsSchema.parse(details);
    await this.store.upsertDetails('audio', lessonId, {
      audioUrl: d.audioUrl ?? null,
      durationSeconds: d.durationSeconds ?? null,
    });
  }

  getDetails(lessonId: string): Promise<Record<string, unknown> | null> {
    return this.store.getDetails('audio', lessonId);
  }

  async onPublish(): Promise<void> {}

  async onComplete(): Promise<void> {}
}
