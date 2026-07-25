import type {
  CreateExamRequest,
  ExamView,
  GradebookResponse,
  GradebookStudentRow,
  RecordResultRequest,
  ReportCardExam,
  ReportCardResponse,
  ReportCardSubject,
  UserRole,
} from '@madrasty/shared';
import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import type {
  AcademicRecordsRepository,
  ExamRow,
  StudentResultRow,
  SubjectTranslationRow,
  UserBrief,
} from './academic-records.repository';

export interface Actor {
  id: string;
  role: UserRole;
}

function isAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'center_admin';
}

// Round to one decimal place — report-card percentages read cleanly.
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Pick a localized value from a jsonb { ar, en } map, falling back to the default
// locale then any present value.
function resolveTitle(title: unknown, locale: string, defaultLocale: string): string | null {
  const map = (title ?? {}) as Record<string, string>;
  return map[locale] ?? map[defaultLocale] ?? Object.values(map)[0] ?? null;
}

// Subject display name from the translations table (field 'name', then 'title'),
// falling back to the subject slug (doc 07 fallback convention).
function resolveSubjectName(
  rows: SubjectTranslationRow[],
  subjectId: string,
  locale: string,
  defaultLocale: string,
  slug: string | null,
): string | null {
  for (const field of ['name', 'title']) {
    let fallback: string | null = null;
    for (const r of rows) {
      if (r.entityId !== subjectId || r.field !== field) continue;
      if (r.locale === locale) return r.value;
      if (r.locale === defaultLocale) fallback = r.value;
    }
    if (fallback) return fallback;
  }
  return slug;
}

function pct(score: number, maxScore: number): number {
  return maxScore > 0 ? round1((score / maxScore) * 100) : 0;
}

// Weighted average of percentages: Σ(weight·pct) / Σ(weight).
function weightedAverage(items: Array<{ percentage: number; weight: number }>): number | null {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) return null;
  const sum = items.reduce((s, i) => s + i.weight * i.percentage, 0);
  return round1(sum / totalWeight);
}

// Exams & report cards (doc 10 §3.1, §6). Policy:
// - Only a teacher creates exams / records grades, and only on their OWN exams
//   (and, when program-linked, programs they own).
// - A report card is readable by the student themselves, their APPROVED parent,
//   or an admin — never another child's data.
export class AcademicRecordsService {
  constructor(private readonly repo: AcademicRecordsRepository) {}

  private get defaultLocale(): string {
    return config.DEFAULT_LOCALE;
  }

  async createExam(actor: Actor, req: CreateExamRequest, locale: string): Promise<ExamView> {
    const title = this.cleanTitle(req.title);
    if (req.maxScore <= 0) {
      throw HttpError.badRequest('invalid_max_score', 'maxScore must be greater than zero.');
    }
    if (!(await this.repo.subjectExists(req.subjectId))) {
      throw HttpError.badRequest('subject_not_found', 'The selected subject does not exist.');
    }
    const programId = req.programId ?? null;
    if (programId && !(await this.repo.teacherOwnsProgram(actor.id, programId))) {
      throw HttpError.forbidden('not_your_program', 'You do not own the selected program.');
    }
    const row = await this.repo.createExam({
      teacherId: actor.id,
      subjectId: req.subjectId,
      programId,
      title,
      maxScore: req.maxScore,
      weight: req.weight ?? 1,
      term: req.term ?? null,
    });
    return this.toExamView(row, locale);
  }

  async listMyExams(actor: Actor, locale: string): Promise<ExamView[]> {
    const rows = await this.repo.listExamsByTeacher(actor.id);
    return rows.map((r) => this.toExamView(r, locale));
  }

  async recordResult(
    actor: Actor,
    examId: string,
    req: RecordResultRequest,
    _locale: string,
  ): Promise<GradebookStudentRow> {
    const exam = await this.requireExam(examId);
    this.assertExamOwner(actor, exam);
    const max = Number(exam.maxScore);
    if (req.score < 0 || req.score > max) {
      throw HttpError.badRequest('score_out_of_range', `Score must be between 0 and ${max}.`);
    }
    const row = await this.repo.upsertResult(
      examId,
      req.studentId,
      req.score,
      req.comment ?? null,
      actor.id,
    );
    const [brief] = await this.repo.getUsersBrief([req.studentId]);
    return {
      student: brief ?? { id: req.studentId, fullName: null },
      result: {
        score: Number(row.score),
        percentage: pct(Number(row.score), max),
        teacherComment: row.teacherComment,
        gradedAt: row.gradedAt.toISOString(),
      },
    };
  }

  async getGradebook(actor: Actor, examId: string, locale: string): Promise<GradebookResponse> {
    const exam = await this.requireExam(examId);
    // Owner grades; admin may view read-only.
    if (exam.teacherId !== actor.id && !isAdmin(actor.role)) {
      throw HttpError.forbidden('not_your_exam', 'You do not own this exam.');
    }
    const max = Number(exam.maxScore);
    const results = await this.repo.listResultsForExam(examId);
    const resultByStudent = new Map(results.map((r) => [r.studentId, r]));

    // Roster = the program's active enrollees (when program-linked); plus anyone
    // already graded who isn't currently enrolled (kept so a grade never vanishes).
    let roster: UserBrief[] = exam.programId
      ? await this.repo.listEnrolledStudents(exam.programId)
      : [];
    const rosterIds = new Set(roster.map((r) => r.id));
    const extraIds = results.map((r) => r.studentId).filter((id) => !rosterIds.has(id));
    if (extraIds.length) {
      roster = [...roster, ...(await this.repo.getUsersBrief(extraIds))];
    }

    const rows: GradebookStudentRow[] = roster.map((student) => {
      const r = resultByStudent.get(student.id) ?? null;
      return {
        student,
        result: r
          ? {
              score: Number(r.score),
              percentage: pct(Number(r.score), max),
              teacherComment: r.teacherComment,
              gradedAt: r.gradedAt.toISOString(),
            }
          : null,
      };
    });
    return { exam: this.toExamView(exam, locale), rows };
  }

  async getReportCard(
    actor: Actor,
    studentId: string,
    term: string | undefined,
    locale: string,
  ): Promise<ReportCardResponse> {
    const canView =
      actor.id === studentId ||
      (actor.role === 'parent' && (await this.repo.isApprovedParentOf(actor.id, studentId))) ||
      isAdmin(actor.role);
    if (!canView) {
      throw HttpError.forbidden('not_authorized', 'You cannot view this report card.');
    }

    const results = await this.repo.listResultsForStudent(studentId, term);
    const subjectIds = [...new Set(results.map((r) => r.subjectId))];
    const [slugs, translationRows] = await Promise.all([
      this.repo.getSubjectSlugs(subjectIds),
      this.repo.getSubjectTranslations(subjectIds),
    ]);
    const slugById = new Map(slugs.map((s) => [s.id, s.slug]));

    // Group graded exams by subject.
    const bySubject = new Map<string, ReportCardExam[]>();
    for (const r of results) {
      const exam = this.toReportCardExam(r, locale);
      const list = bySubject.get(r.subjectId);
      if (list) list.push(exam);
      else bySubject.set(r.subjectId, [exam]);
    }

    const subjects: ReportCardSubject[] = [...bySubject.entries()].map(([subjectId, exams]) => ({
      subjectId,
      subjectName: resolveSubjectName(
        translationRows,
        subjectId,
        locale,
        this.defaultLocale,
        slugById.get(subjectId) ?? null,
      ),
      average: weightedAverage(exams) ?? 0,
      exams,
    }));

    const overallAverage = results.length
      ? weightedAverage(
          results.map((r) => ({
            percentage: pct(Number(r.score), Number(r.maxScore)),
            weight: Number(r.weight),
          })),
        )
      : null;

    return { studentId, term: term ?? null, subjects, overallAverage };
  }

  // --- internals ---

  private async requireExam(id: string): Promise<ExamRow> {
    const exam = await this.repo.getExamById(id);
    if (!exam) throw HttpError.notFound('exam_not_found', 'Exam not found.');
    return exam;
  }

  private assertExamOwner(actor: Actor, exam: ExamRow): void {
    if (exam.teacherId !== actor.id) {
      throw HttpError.forbidden('not_your_exam', 'You do not own this exam.');
    }
  }

  private cleanTitle(title: CreateExamRequest['title']): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [locale, value] of Object.entries(title ?? {})) {
      if (typeof value === 'string' && value.trim() !== '') out[locale] = value.trim();
    }
    if (Object.keys(out).length === 0) {
      throw HttpError.badRequest('title_required', 'An exam title is required in at least one language.');
    }
    return out;
  }

  private toExamView(row: ExamRow, locale: string): ExamView {
    return {
      id: row.id,
      subjectId: row.subjectId,
      programId: row.programId,
      title: resolveTitle(row.title, locale, this.defaultLocale),
      maxScore: Number(row.maxScore),
      weight: Number(row.weight),
      term: row.term,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toReportCardExam(r: StudentResultRow, locale: string): ReportCardExam {
    const score = Number(r.score);
    const maxScore = Number(r.maxScore);
    return {
      examId: r.examId,
      title: resolveTitle(r.title, locale, this.defaultLocale),
      score,
      maxScore,
      percentage: pct(score, maxScore),
      weight: Number(r.weight),
      term: r.term,
      gradedAt: r.gradedAt.toISOString(),
      teacherComment: r.teacherComment,
    };
  }
}
