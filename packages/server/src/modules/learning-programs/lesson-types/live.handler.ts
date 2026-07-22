import { z } from 'zod';
import type { LessonTypeHandler } from './handler';
import type { LessonDetailsStore } from '../learning-programs.repository';

const liveDetailsSchema = z.object({
  scheduledStart: z.coerce.date().optional(),
  scheduledEnd: z.coerce.date().optional(),
  meetingUrl: z.string().url().optional(),
  recordingUrl: z.string().url().optional(),
  attendanceTaken: z.boolean().optional(),
});

export class LiveLessonHandler implements LessonTypeHandler {
  readonly type = 'live' as const;
  readonly detailsSchema = liveDetailsSchema;

  constructor(private readonly store: LessonDetailsStore) {}

  async saveDetails(lessonId: string, details: unknown): Promise<void> {
    const d = liveDetailsSchema.parse(details);
    await this.store.upsertDetails('live', lessonId, {
      scheduledStart: d.scheduledStart ?? null,
      scheduledEnd: d.scheduledEnd ?? null,
      meetingUrl: d.meetingUrl ?? null,
      recordingUrl: d.recordingUrl ?? null,
      attendanceTaken: d.attendanceTaken ?? false,
    });
  }

  getDetails(lessonId: string): Promise<Record<string, unknown> | null> {
    return this.store.getDetails('live', lessonId);
  }

  async onPublish(): Promise<void> {
    // A real impl would provision the meeting room / schedule reminders here.
  }

  async onComplete(): Promise<void> {
    // Attendance + recording→replay handling lands with the live-classes module.
  }
}
