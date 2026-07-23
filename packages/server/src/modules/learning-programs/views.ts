import type { ProgramRecord } from './types';
import type { LocalizedText } from './localized';

// Public-facing program summary (browsing + "my programs"). title/description are
// resolved for the request locale from the translations table (doc 12 §6).
export interface ProgramSummary {
  id: string;
  teacherId: string;
  subjectId: string | null;
  gradeLevel: string | null;
  semester: string | null;
  priceEgp: string | null;
  status: string;
  title: string | null;
  description: string | null;
}

// Authoring view (create/update/listMine) — the summary plus the raw metadata
// the owner/admin is allowed to see (browse never exposes metadata).
export interface LocalizedProgram extends ProgramSummary {
  metadata: Record<string, unknown>;
}

export function toProgramSummary(program: ProgramRecord, text: LocalizedText): ProgramSummary {
  return {
    id: program.id,
    teacherId: program.teacherId,
    subjectId: program.subjectId,
    gradeLevel: program.gradeLevel,
    semester: program.semester,
    priceEgp: program.priceEgp,
    status: program.status,
    title: text.title,
    description: text.description,
  };
}

export function toLocalizedProgram(program: ProgramRecord, text: LocalizedText): LocalizedProgram {
  return { ...toProgramSummary(program, text), metadata: program.metadata };
}
