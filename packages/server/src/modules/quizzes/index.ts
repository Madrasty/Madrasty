import { DrizzleQuizzesRepository } from './quizzes.repository';
import { QuizzesService } from './quizzes.service';

// Composition helper: assembles the quizzes service from its repository.
export function buildQuizzesService(): QuizzesService {
  return new QuizzesService(new DrizzleQuizzesRepository());
}
