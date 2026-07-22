import { z } from 'zod';
import type { LessonTypeHandler } from './handler';
import type { LessonDetailsStore } from '../learning-programs.repository';

const pdfDetailsSchema = z.object({
  fileUrl: z.string().url().optional(),
  pageCount: z.number().int().positive().optional(),
});

export class PdfLessonHandler implements LessonTypeHandler {
  readonly type = 'pdf' as const;
  readonly detailsSchema = pdfDetailsSchema;

  constructor(private readonly store: LessonDetailsStore) {}

  async saveDetails(lessonId: string, details: unknown): Promise<void> {
    const d = pdfDetailsSchema.parse(details);
    await this.store.upsertDetails('pdf', lessonId, {
      fileUrl: d.fileUrl ?? null,
      pageCount: d.pageCount ?? null,
    });
  }

  getDetails(lessonId: string): Promise<Record<string, unknown> | null> {
    return this.store.getDetails('pdf', lessonId);
  }

  async onPublish(): Promise<void> {}

  async onComplete(): Promise<void> {}
}
