import { DrizzleAcademicRecordsRepository } from './academic-records.repository';
import { AcademicRecordsService } from './academic-records.service';

// Composition helper: assembles the academic-records service from its repository.
export function buildAcademicRecordsService(): AcademicRecordsService {
  return new AcademicRecordsService(new DrizzleAcademicRecordsRepository());
}
