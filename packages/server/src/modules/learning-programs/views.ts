import type { ProgramRecord } from './types';

// Public-facing program summary (shared by browsing and "my programs"). Title
// currently rides in metadata.title until the translations table is wired in.
export interface ProgramSummary {
  id: string;
  teacherId: string;
  subjectId: string | null;
  gradeLevel: string | null;
  semester: string | null;
  priceEgp: string | null;
  status: string;
  title: unknown;
}

export function toProgramSummary(program: ProgramRecord): ProgramSummary {
  return {
    id: program.id,
    teacherId: program.teacherId,
    subjectId: program.subjectId,
    gradeLevel: program.gradeLevel,
    semester: program.semester,
    priceEgp: program.priceEgp,
    status: program.status,
    title: program.metadata.title ?? null,
  };
}
