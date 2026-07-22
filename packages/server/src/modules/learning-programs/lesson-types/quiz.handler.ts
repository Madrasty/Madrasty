import { StubLessonHandler } from './stub.handler';

// Quiz lessons reuse the `quizzes` table (doc 03) via the future quizzes module.
export class QuizLessonHandler extends StubLessonHandler {
  constructor() {
    super('quiz', 'quizzes module');
  }
}
