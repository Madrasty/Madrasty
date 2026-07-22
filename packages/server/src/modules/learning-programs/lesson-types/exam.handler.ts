import { StubLessonHandler } from './stub.handler';

// Exam lessons reuse the `exams`/`exam_results` tables (doc 10).
export class ExamLessonHandler extends StubLessonHandler {
  constructor() {
    super('exam', 'academic-records module');
  }
}
