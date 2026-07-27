import type {
  CreateExamRequest,
  ExamView,
  GradebookResponse,
  GradebookStudentRow,
  RecordResultRequest,
  ReportCardExam,
  ReportCardHomeworkSummary,
  ReportCardQuizSummary,
  ReportCardResponse,
  ReportCardSubject,
  UserRole,
} from '@madrasty/shared';
import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import type {
  AcademicRecordsRepository,
  ExamRow,
  HomeworkSubmissionStatRow,
  QuizStatRow,
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

// Quiz roll-up for one subject. Each row is already the student's BEST attempt on
// one quiz (the repository reduces retakes), so this is a plain mean — quizzes
// carry no weight column, unlike exams.
function summarizeQuizzes(rows: QuizStatRow[]): ReportCardQuizSummary {
  if (rows.length === 0) return { count: 0, average: null };
  const sum = rows.reduce((s, r) => s + Number(r.bestPercentage), 0);
  return { count: rows.length, average: round1(sum / rows.length) };
}

// Homework roll-up for one subject. `assigned` is what was SET for the student
// (assignments in programs they're enrolled in), so completion measures them
// against the whole workload, not just what they chose to hand in.
function summarizeHomework(
  assigned: number,
  rows: HomeworkSubmissionStatRow[],
): ReportCardHomeworkSummary {
  const submitted = rows.length;
  const late = rows.filter((r) => r.status === 'late').length;
  const gradedRows = rows.filter((r) => r.status === 'graded' && r.grade !== null);
  const average = gradedRows.length
    ? round1(
        gradedRows.reduce((s, r) => s + pct(Number(r.grade), Number(r.maxGrade)), 0) /
          gradedRows.length,
      )
    : null;

  return {
    assigned,
    submitted,
    late,
    graded: gradedRows.length,
    // Guard against >100%: a submission can outlive the assignment count if a
    // student is unenrolled from the program after handing work in.
    completionRate: assigned > 0 ? round1(Math.min(submitted / assigned, 1) * 100) : null,
    onTimeRate:
      assigned > 0 ? round1(Math.min(Math.max(submitted - late, 0) / assigned, 1) * 100) : null,
    average,
  };
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

    // Three independent sources, one per assessment type (doc 10 §3.1). `term`
    // filters exams only — quizzes/homework carry no term column.
    const [results, quizStats, homeworkAssigned, homeworkSubmissions] = await Promise.all([
      this.repo.listResultsForStudent(studentId, term),
      this.repo.listQuizStatsForStudent(studentId),
      this.repo.listHomeworkAssignedForStudent(studentId),
      this.repo.listHomeworkSubmissionsForStudent(studentId),
    ]);

    // A subject belongs on the card if it has ANY activity — a program whose
    // homework the student has ignored still needs to show up, precisely because
    // the completion rate is the interesting number there.
    const subjectIds = [
      ...new Set([
        ...results.map((r) => r.subjectId),
        ...quizStats.map((q) => q.subjectId),
        ...homeworkAssigned.map((h) => h.subjectId),
        ...homeworkSubmissions.map((h) => h.subjectId),
      ]),
    ];

    const [slugs, translationRows] = await Promise.all([
      this.repo.getSubjectSlugs(subjectIds),
      this.repo.getSubjectTranslations(subjectIds),
    ]);
    const slugById = new Map(slugs.map((s) => [s.id, s.slug]));

    // Group graded exams by subject.
    const examsBySubject = new Map<string, ReportCardExam[]>();
    for (const r of results) {
      const exam = this.toReportCardExam(r, locale);
      const list = examsBySubject.get(r.subjectId);
      if (list) list.push(exam);
      else examsBySubject.set(r.subjectId, [exam]);
    }

    const subjects: ReportCardSubject[] = subjectIds.map((subjectId) => {
      const exams = examsBySubject.get(subjectId) ?? [];
      return {
        subjectId,
        subjectName: resolveSubjectName(
          translationRows,
          subjectId,
          locale,
          this.defaultLocale,
          slugById.get(subjectId) ?? null,
        ),
        average: exams.length ? weightedAverage(exams) : null,
        exams,
        quizzes: summarizeQuizzes(quizStats.filter((q) => q.subjectId === subjectId)),
        homework: summarizeHomework(
          homeworkAssigned.find((h) => h.subjectId === subjectId)?.assigned ?? 0,
          homeworkSubmissions.filter((h) => h.subjectId === subjectId),
        ),
      };
    });

    const overallAverage = results.length
      ? weightedAverage(
          results.map((r) => ({
            percentage: pct(Number(r.score), Number(r.maxScore)),
            weight: Number(r.weight),
          })),
        )
      : null;

    return {
      studentId,
      term: term ?? null,
      subjects,
      overallAverage,
      quizzesAndHomeworkAreAllTime: true,
    };
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
