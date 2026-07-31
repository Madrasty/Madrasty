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
    // Nothing to provision here on purpose: the room is created when the teacher
    // actually starts the class (live-classes module), not when the lesson is
    // published. A room provisioned at publish time would sit open — and its
    // join tokens valid — for however long the gap to the lesson happens to be.
  }

  async onComplete(): Promise<void> {
    // Attendance is not recorded here: it comes from real join/leave events
    // against the live-classes module (doc 10 §3.4), and a student marking a
    // lesson complete is not evidence they attended it. Recording→replay stays
    // manual for now — the teacher sets `recordingUrl` after the session, and
    // the lesson then plays back like a recorded one (doc 12 §4).
  }
}
