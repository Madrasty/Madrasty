import { StubLessonHandler } from './stub.handler';

// Homework lessons reuse the `homework_submissions` table (doc 03).
export class HomeworkLessonHandler extends StubLessonHandler {
  constructor() {
    super('homework', 'homework module');
  }
}
