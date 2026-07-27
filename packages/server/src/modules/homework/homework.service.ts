import type {
  CreateAssignmentRequest,
  GradeHomeworkRequest,
  HomeworkAssignmentView,
  HomeworkByLessonResponse,
  HomeworkQueueResponse,
  HomeworkSubmissionStatus,
  HomeworkSubmissionView,
  SubmitHomeworkRequest,
  UpdateAssignmentRequest,
  UserRole,
} from '@madrasty/shared';
import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import type {
  AssignmentRow,
  HomeworkRepository,
  SubmissionRow,
} from './homework.repository';

export interface Actor {
  id: string;
  role: UserRole;
}

function isAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'center_admin';
}

function resolveLocalized(value: unknown, locale: string, defaultLocale: string): string | null {
  const map = (value ?? {}) as Record<string, string>;
  return map[locale] ?? map[defaultLocale] ?? Object.values(map)[0] ?? null;
}

// Homework (doc 03, doc 12 §6). Policy — deliberately the same shape as quizzes:
// - Only the owning teacher authors/edits an assignment and grades its
//   submissions (the assignment's program must be theirs); admins may read.
// - Only a student ENROLLED in the assignment's program may submit; students see
//   their own submission and never anyone else's.
// - Submitting completes the homework lesson → powers prerequisite gating
//   (doc 12 §5). Completion is on SUBMIT, not on grade, because grading is
//   asynchronous and a student shouldn't be blocked waiting for a teacher.
// - Submissions are text-only for now; attachments wait on object storage.
export class HomeworkService {
  constructor(private readonly repo: HomeworkRepository) {}

  private get defaultLocale(): string {
    return config.DEFAULT_LOCALE;
  }

  async createAssignment(
    actor: Actor,
    req: CreateAssignmentRequest,
    locale: string,
  ): Promise<HomeworkAssignmentView> {
    const info = await this.repo.resolveLessonInfo(req.lessonId);
    if (!info) throw HttpError.notFound('lesson_not_found', 'Lesson not found.');
    if (info.lessonType !== 'homework') {
      throw HttpError.badRequest(
        'not_a_homework_lesson',
        'This lesson is not a homework-type lesson.',
      );
    }
    if (!(await this.repo.teacherOwnsProgram(actor.id, info.programId))) {
      throw HttpError.forbidden('not_your_program', 'You do not own this program.');
    }
    if (await this.repo.getAssignmentByLesson(req.lessonId)) {
      throw HttpError.conflict('assignment_exists', 'This lesson already has an assignment.');
    }

    const brief = this.cleanLocalized(req.brief, 'brief_required', 'An assignment brief is required.');
    const maxGrade = req.maxGrade ?? 100;
    if (maxGrade <= 0) {
      throw HttpError.badRequest('invalid_max_grade', 'maxGrade must be greater than zero.');
    }
    const row = await this.repo.createAssignment({
      lessonId: req.lessonId,
      programId: info.programId,
      teacherId: actor.id,
      brief,
      maxGrade,
      dueAt: this.parseDueAt(req.dueAt),
      allowLate: req.allowLate ?? true,
    });
    return this.toAssignmentView(row, locale, { mySubmission: null, counts: { total: 0, pending: 0 } });
  }

  async updateAssignment(
    actor: Actor,
    assignmentId: string,
    req: UpdateAssignmentRequest,
    locale: string,
  ): Promise<HomeworkAssignmentView> {
    const assignment = await this.requireAssignment(assignmentId);
    this.assertOwner(actor, assignment);

    if (req.maxGrade !== undefined && req.maxGrade <= 0) {
      throw HttpError.badRequest('invalid_max_grade', 'maxGrade must be greater than zero.');
    }
    const updated = await this.repo.updateAssignment(assignmentId, {
      brief:
        req.brief === undefined
          ? undefined
          : this.cleanLocalized(req.brief, 'brief_required', 'An assignment brief is required.'),
      maxGrade: req.maxGrade,
      dueAt: req.dueAt === undefined ? undefined : this.parseDueAt(req.dueAt),
      allowLate: req.allowLate,
    });
    if (!updated) throw HttpError.notFound('assignment_not_found', 'Assignment not found.');
    const counts = await this.repo.countSubmissions(assignmentId);
    return this.toAssignmentView(updated, locale, { mySubmission: null, counts });
  }

  // Owner/admin get the assignment + submission counts; an enrolled student gets
  // the assignment + their own submission.
  async getAssignment(
    actor: Actor,
    assignmentId: string,
    locale: string,
  ): Promise<HomeworkAssignmentView> {
    const assignment = await this.requireAssignment(assignmentId);
    const owner = assignment.teacherId === actor.id || isAdmin(actor.role);
    if (owner) {
      const counts = await this.repo.countSubmissions(assignmentId);
      return this.toAssignmentView(assignment, locale, { mySubmission: null, counts });
    }
    await this.assertEnrolledStudent(actor, assignment);
    const mine = await this.repo.getSubmission(assignmentId, actor.id);
    return this.toAssignmentView(assignment, locale, { mySubmission: mine });
  }

  async getAssignmentIdByLesson(lessonId: string): Promise<HomeworkByLessonResponse> {
    const assignment = await this.repo.getAssignmentByLesson(lessonId);
    return { assignmentId: assignment?.id ?? null };
  }

  // Student submits — or replaces an earlier, still-ungraded submission.
  async submit(
    actor: Actor,
    assignmentId: string,
    req: SubmitHomeworkRequest,
    _locale: string,
  ): Promise<HomeworkSubmissionView> {
    const assignment = await this.requireAssignment(assignmentId);
    await this.assertEnrolledStudent(actor, assignment);

    const content = (req.content ?? '').trim();
    if (content === '') {
      throw HttpError.badRequest('content_required', 'Write your answer before submitting.');
    }

    const existing = await this.repo.getSubmission(assignmentId, actor.id);
    if (existing && existing.status === 'graded') {
      throw HttpError.conflict('already_graded', 'This submission has already been graded.');
    }

    // Deadline handling: past due either blocks (hard deadline) or downgrades the
    // status to 'late' (doc 03).
    const late = assignment.dueAt !== null && Date.now() > assignment.dueAt.getTime();
    if (late && !assignment.allowLate) {
      throw HttpError.badRequest('past_due', 'The deadline for this assignment has passed.');
    }

    const row = await this.repo.upsertSubmission({
      assignmentId,
      studentId: actor.id,
      content,
      status: late ? 'late' : 'submitted',
    });

    // Submitting completes the lesson → unlocks anything gated on this homework.
    await this.repo.markLessonCompleted(actor.id, assignment.lessonId);

    return this.toSubmissionView(row);
  }

  // Teacher grading queue: every submission plus the enrolled students who
  // haven't submitted yet.
  async listSubmissions(
    actor: Actor,
    assignmentId: string,
    locale: string,
  ): Promise<HomeworkQueueResponse> {
    const assignment = await this.requireAssignment(assignmentId);
    if (assignment.teacherId !== actor.id && !isAdmin(actor.role)) {
      throw HttpError.forbidden('not_your_assignment', 'You do not own this assignment.');
    }

    const [submissions, roster] = await Promise.all([
      this.repo.listSubmissions(assignmentId),
      this.repo.listEnrolledStudents(assignment.programId),
    ]);
    const byStudent = new Map(roster.map((s) => [s.id, s]));
    const submitted = new Set(submissions.map((s) => s.studentId));

    const rows = submissions.map((s) => ({
      student: byStudent.get(s.studentId) ?? { id: s.studentId, fullName: null },
      submission: this.toSubmissionView(s),
    }));
    const missing = roster.filter((s) => !submitted.has(s.id));
    const counts = {
      total: submissions.length,
      pending: submissions.filter((s) => s.status !== 'graded').length,
    };

    return {
      assignment: this.toAssignmentView(assignment, locale, { mySubmission: null, counts }),
      rows,
      missing,
    };
  }

  async grade(
    actor: Actor,
    submissionId: string,
    req: GradeHomeworkRequest,
  ): Promise<HomeworkSubmissionView> {
    const submission = await this.repo.getSubmissionById(submissionId);
    if (!submission) throw HttpError.notFound('submission_not_found', 'Submission not found.');
    const assignment = await this.requireAssignment(submission.assignmentId);
    this.assertOwner(actor, assignment);

    const max = Number(assignment.maxGrade);
    if (!Number.isFinite(req.grade) || req.grade < 0 || req.grade > max) {
      throw HttpError.badRequest('invalid_grade', `grade must be between 0 and ${max}.`);
    }
    const graded = await this.repo.gradeSubmission(submissionId, {
      grade: req.grade,
      teacherComment: req.teacherComment?.trim() || null,
      graderId: actor.id,
    });
    if (!graded) throw HttpError.notFound('submission_not_found', 'Submission not found.');
    return this.toSubmissionView(graded);
  }

  // --- internals ---

  private async requireAssignment(id: string): Promise<AssignmentRow> {
    const row = await this.repo.getAssignmentById(id);
    if (!row) throw HttpError.notFound('assignment_not_found', 'Assignment not found.');
    return row;
  }

  private assertOwner(actor: Actor, assignment: AssignmentRow): void {
    if (assignment.teacherId !== actor.id) {
      throw HttpError.forbidden('not_your_assignment', 'You do not own this assignment.');
    }
  }

  private async assertEnrolledStudent(actor: Actor, assignment: AssignmentRow): Promise<void> {
    if (
      actor.role !== 'student' ||
      !(await this.repo.studentEnrolledIn(actor.id, assignment.programId))
    ) {
      throw HttpError.forbidden('not_enrolled', 'You are not enrolled in this assignment’s program.');
    }
  }

  private parseDueAt(value: string | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw HttpError.badRequest('invalid_due_at', 'dueAt must be a valid ISO date.');
    }
    return date;
  }

  private cleanLocalized(value: unknown, code: string, message: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [locale, v] of Object.entries((value ?? {}) as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim() !== '') out[locale] = v.trim();
    }
    if (Object.keys(out).length === 0) throw HttpError.badRequest(code, message);
    return out;
  }

  private toSubmissionView(row: SubmissionRow): HomeworkSubmissionView {
    return {
      id: row.id,
      assignmentId: row.assignmentId,
      studentId: row.studentId,
      content: row.content,
      status: row.status as HomeworkSubmissionStatus,
      grade: row.grade === null ? null : Number(row.grade),
      teacherComment: row.teacherComment,
      gradedAt: row.gradedAt ? row.gradedAt.toISOString() : null,
      submittedAt: row.submittedAt.toISOString(),
    };
  }

  private toAssignmentView(
    row: AssignmentRow,
    locale: string,
    extra: {
      mySubmission: SubmissionRow | null;
      counts?: { total: number; pending: number };
    },
  ): HomeworkAssignmentView {
    const view: HomeworkAssignmentView = {
      id: row.id,
      lessonId: row.lessonId,
      programId: row.programId,
      brief: resolveLocalized(row.brief, locale, this.defaultLocale),
      maxGrade: Number(row.maxGrade),
      dueAt: row.dueAt ? row.dueAt.toISOString() : null,
      allowLate: row.allowLate,
      createdAt: row.createdAt.toISOString(),
      mySubmission: extra.mySubmission ? this.toSubmissionView(extra.mySubmission) : null,
    };
    if (extra.counts) {
      view.submissionCount = extra.counts.total;
      view.pendingReviewCount = extra.counts.pending;
    }
    return view;
  }
}
