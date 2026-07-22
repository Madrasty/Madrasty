import { z } from 'zod';
import type { LessonTypeHandler } from './handler';
import type { LessonDetailsStore } from '../learning-programs.repository';

const recordedDetailsSchema = z.object({
  videoUrl: z.string().url().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  attachments: z
    .array(z.object({ name: z.string(), url: z.string().url() }))
    .optional(),
});

export class RecordedLessonHandler implements LessonTypeHandler {
  readonly type = 'recorded' as const;
  readonly detailsSchema = recordedDetailsSchema;

  constructor(private readonly store: LessonDetailsStore) {}

  async saveDetails(lessonId: string, details: unknown): Promise<void> {
    const d = recordedDetailsSchema.parse(details);
    await this.store.upsertDetails('recorded', lessonId, {
      videoUrl: d.videoUrl ?? null,
      durationSeconds: d.durationSeconds ?? null,
      attachments: d.attachments ?? null,
    });
  }

  getDetails(lessonId: string): Promise<Record<string, unknown> | null> {
    return this.store.getDetails('recorded', lessonId);
  }

  async onPublish(): Promise<void> {
    // No side effects yet; a real impl might transcode/verify the video asset.
  }

  async onComplete(): Promise<void> {
    // Progress tracking lands with the engagement module (doc 10).
  }
}
