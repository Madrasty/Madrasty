import { DrizzleHomeworkRepository } from './homework.repository';
import { HomeworkService } from './homework.service';

// Composition helper: assembles the homework service from its repository.
export function buildHomeworkService(): HomeworkService {
  return new HomeworkService(new DrizzleHomeworkRepository());
}
