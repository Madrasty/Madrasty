import { beforeEach, describe, expect, it } from 'vitest';
import { HttpError } from '../../lib/http-error';
import { HomeworkService, type Actor } from './homework.service';
import type {
  AssignmentPatch,
  AssignmentRow,
  GradePatch,
  HomeworkRepository,
  LessonInfo,
  NewAssignment,
  SubmissionRow,
  SubmissionUpsert,
  UserBrief,
} from './homework.repository';

// In-memory fake repo (same DI/fake pattern as the other modules).
class FakeRepo implements HomeworkRepository {
  assignments: AssignmentRow[] = [];
  submissions: SubmissionRow[] = [];
  lessons = new Map<string, LessonInfo>();
  programOwners = new Map<string, string>(); // programId -> teacherId
  enrolled = new Set<string>(); // `${studentId}:${programId}`
  roster = new Map<string, UserBrief[]>(); // programId -> students
  completedLessons: Array<{ studentId: string; lessonId: string }> = [];
  private seq = 0;

  async resolveLessonInfo(lessonId: string) {
    return this.lessons.get(lessonId) ?? null;
  }
  async teacherOwnsProgram(teacherId: string, programId: string) {
    return this.programOwners.get(programId) === teacherId;
  }
  async studentEnrolledIn(studentId: string, programId: string) {
    return this.enrolled.has(`${studentId}:${programId}`);
  }
  async listEnrolledStudents(programId: string) {
    return this.roster.get(programId) ?? [];
  }
  async getAssignmentById(id: string) {
    return this.assignments.find((a) => a.id === id) ?? null;
  }
  async getAssignmentByLesson(lessonId: string) {
    return this.assignments.find((a) => a.lessonId === lessonId) ?? null;
  }
  async createAssignment(input: NewAssignment): Promise<AssignmentRow> {
    const row: AssignmentRow = {
      id: `hw${++this.seq}`,
      lessonId: input.lessonId,
      programId: input.programId,
      teacherId: input.teacherId,
      brief: input.brief,
      maxGrade: String(input.maxGrade),
      dueAt: input.dueAt,
      allowLate: input.allowLate,
      createdAt: new Date(),
    };
    this.assignments.push(row);
    return row;
  }
  async updateAssignment(id: string, patch: AssignmentPatch) {
    const row = this.assignments.find((a) => a.id === id);
    if (!row) return null;
    if (patch.brief !== undefined) row.brief = patch.brief;
    if (patch.maxGrade !== undefined) row.maxGrade = String(patch.maxGrade);
    if (patch.dueAt !== undefined) row.dueAt = patch.dueAt;
    if (patch.allowLate !== undefined) row.allowLate = patch.allowLate;
    return row;
  }
  async getSubmission(assignmentId: string, studentId: string) {
    return (
      this.submissions.find((s) => s.assignmentId === assignmentId && s.studentId === studentId) ??
      null
    );
  }
  async getSubmissionById(id: string) {
    return this.submissions.find((s) => s.id === id) ?? null;
  }
  async upsertSubmission(input: SubmissionUpsert): Promise<SubmissionRow> {
    const existing = await this.getSubmission(input.assignmentId, input.studentId);
    if (existing) {
      existing.content = input.content;
      existing.status = input.status;
      existing.submittedAt = new Date();
      return existing;
    }
    const row: SubmissionRow = {
      id: `s${++this.seq}`,
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      content: input.content,
      status: input.status,
      grade: null,
      teacherComment: null,
      gradedBy: null,
      gradedAt: null,
      submittedAt: new Date(),
    };
    this.submissions.push(row);
    return row;
  }
  async listSubmissions(assignmentId: string) {
    return this.submissions.filter((s) => s.assignmentId === assignmentId);
  }
  async countSubmissions(assignmentId: string) {
    const rows = await this.listSubmissions(assignmentId);
    return { total: rows.length, pending: rows.filter((s) => s.status !== 'graded').length };
  }
  async gradeSubmission(id: string, patch: GradePatch) {
    const row = this.submissions.find((s) => s.id === id);
    if (!row) return null;
    row.grade = String(patch.grade);
    row.teacherComment = patch.teacherComment;
    row.status = 'graded';
    row.gradedBy = 'teacher';
    row.gradedAt = new Date();
    return row;
  }
  async markLessonCompleted(studentId: string, lessonId: string) {
    this.completedLessons.push({ studentId, lessonId });
  }
}

const TEACHER = 'teacher-1';
const OTHER_TEACHER = 'teacher-2';
const STUDENT = 'student-1';
const PROGRAM = 'program-1';
const LESSON = 'lesson-1';

const teacherActor: Actor = { id: TEACHER, role: 'teacher' };
const otherTeacherActor: Actor = { id: OTHER_TEACHER, role: 'teacher' };
const studentActor: Actor = { id: STUDENT, role: 'student' };

let repo: FakeRepo;
let service: HomeworkService;

beforeEach(() => {
  repo = new FakeRepo();
  repo.lessons.set(LESSON, { lessonType: 'homework', programId: PROGRAM });
  repo.programOwners.set(PROGRAM, TEACHER);
  repo.enrolled.add(`${STUDENT}:${PROGRAM}`);
  repo.roster.set(PROGRAM, [{ id: STUDENT, fullName: 'Student One' }]);
  service = new HomeworkService(repo);
});

function createAssignment(overrides: Record<string, unknown> = {}) {
  return service.createAssignment(
    teacherActor,
    { lessonId: LESSON, brief: { en: 'Write an essay' }, ...overrides },
    'en',
  );
}

describe('createAssignment', () => {
  it('creates an assignment on a homework-type lesson owned by the teacher', async () => {
    const view = await createAssignment({ maxGrade: 20 });
    expect(view.programId).toBe(PROGRAM);
    expect(view.brief).toBe('Write an essay');
    expect(view.maxGrade).toBe(20);
    expect(view.allowLate).toBe(true);
  });

  it('rejects a lesson that is not a homework lesson', async () => {
    repo.lessons.set('quiz-lesson', { lessonType: 'quiz', programId: PROGRAM });
    await expect(
      service.createAssignment(teacherActor, { lessonId: 'quiz-lesson', brief: { en: 'x' } }, 'en'),
    ).rejects.toMatchObject({ code: 'not_a_homework_lesson' });
  });

  it("rejects a teacher who doesn't own the program", async () => {
    await expect(
      service.createAssignment(otherTeacherActor, { lessonId: LESSON, brief: { en: 'x' } }, 'en'),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('rejects a second assignment on the same lesson', async () => {
    await createAssignment();
    await expect(createAssignment()).rejects.toMatchObject({ code: 'assignment_exists' });
  });

  it('rejects an empty brief', async () => {
    await expect(
      service.createAssignment(teacherActor, { lessonId: LESSON, brief: { en: '  ' } }, 'en'),
    ).rejects.toMatchObject({ code: 'brief_required' });
  });
});

describe('submit', () => {
  it('records a submission and completes the lesson (unlocking gated lessons)', async () => {
    const assignment = await createAssignment();
    const submission = await service.submit(studentActor, assignment.id, { content: ' my answer ' }, 'en');

    expect(submission.status).toBe('submitted');
    expect(submission.content).toBe('my answer');
    expect(repo.completedLessons).toEqual([{ studentId: STUDENT, lessonId: LESSON }]);
  });

  it('replaces an earlier ungraded submission rather than adding a second one', async () => {
    const assignment = await createAssignment();
    await service.submit(studentActor, assignment.id, { content: 'first' }, 'en');
    const second = await service.submit(studentActor, assignment.id, { content: 'second' }, 'en');

    expect(second.content).toBe('second');
    expect(repo.submissions).toHaveLength(1);
  });

  it('rejects a student who is not enrolled', async () => {
    const assignment = await createAssignment();
    await expect(
      service.submit({ id: 'student-2', role: 'student' }, assignment.id, { content: 'x' }, 'en'),
    ).rejects.toMatchObject({ code: 'not_enrolled' });
  });

  it('rejects a teacher trying to submit', async () => {
    const assignment = await createAssignment();
    await expect(
      service.submit(teacherActor, assignment.id, { content: 'x' }, 'en'),
    ).rejects.toMatchObject({ code: 'not_enrolled' });
  });

  it('marks a submission past the deadline as late when late work is allowed', async () => {
    const assignment = await createAssignment({ dueAt: new Date(Date.now() - 60_000).toISOString() });
    const submission = await service.submit(studentActor, assignment.id, { content: 'x' }, 'en');
    expect(submission.status).toBe('late');
  });

  it('blocks a submission past a hard deadline', async () => {
    const assignment = await createAssignment({
      dueAt: new Date(Date.now() - 60_000).toISOString(),
      allowLate: false,
    });
    await expect(
      service.submit(studentActor, assignment.id, { content: 'x' }, 'en'),
    ).rejects.toMatchObject({ code: 'past_due' });
  });

  it('refuses to overwrite a graded submission', async () => {
    const assignment = await createAssignment();
    const submission = await service.submit(studentActor, assignment.id, { content: 'x' }, 'en');
    await service.grade(teacherActor, submission.id, { grade: 10 });

    await expect(
      service.submit(studentActor, assignment.id, { content: 'y' }, 'en'),
    ).rejects.toMatchObject({ code: 'already_graded' });
  });
});

describe('grade', () => {
  it('records a grade and comment', async () => {
    const assignment = await createAssignment({ maxGrade: 20 });
    const submission = await service.submit(studentActor, assignment.id, { content: 'x' }, 'en');

    const graded = await service.grade(teacherActor, submission.id, {
      grade: 17.5,
      teacherComment: ' good work ',
    });
    expect(graded.status).toBe('graded');
    expect(graded.grade).toBe(17.5);
    expect(graded.teacherComment).toBe('good work');
    expect(graded.gradedAt).not.toBeNull();
  });

  it('rejects a grade above the assignment maximum', async () => {
    const assignment = await createAssignment({ maxGrade: 20 });
    const submission = await service.submit(studentActor, assignment.id, { content: 'x' }, 'en');
    await expect(
      service.grade(teacherActor, submission.id, { grade: 21 }),
    ).rejects.toMatchObject({ code: 'invalid_grade' });
  });

  it("rejects a teacher who doesn't own the assignment", async () => {
    const assignment = await createAssignment();
    const submission = await service.submit(studentActor, assignment.id, { content: 'x' }, 'en');
    await expect(
      service.grade(otherTeacherActor, submission.id, { grade: 5 }),
    ).rejects.toMatchObject({ code: 'not_your_assignment' });
  });
});

describe('getAssignment', () => {
  it('gives a student their own submission only', async () => {
    const assignment = await createAssignment();
    await service.submit(studentActor, assignment.id, { content: 'mine' }, 'en');

    const view = await service.getAssignment(studentActor, assignment.id, 'en');
    expect(view.mySubmission?.content).toBe('mine');
    expect(view.submissionCount).toBeUndefined();
  });

  it('gives the owner pending-review counts', async () => {
    const assignment = await createAssignment();
    await service.submit(studentActor, assignment.id, { content: 'x' }, 'en');

    const view = await service.getAssignment(teacherActor, assignment.id, 'en');
    expect(view.submissionCount).toBe(1);
    expect(view.pendingReviewCount).toBe(1);
    expect(view.mySubmission).toBeNull();
  });

  it('falls back to another locale when the brief is not translated', async () => {
    const assignment = await createAssignment();
    const view = await service.getAssignment(teacherActor, assignment.id, 'ar');
    expect(view.brief).toBe('Write an essay');
  });
});

describe('listSubmissions', () => {
  it('returns the grading queue plus students who have not submitted', async () => {
    repo.roster.set(PROGRAM, [
      { id: STUDENT, fullName: 'Student One' },
      { id: 'student-2', fullName: 'Student Two' },
    ]);
    const assignment = await createAssignment();
    await service.submit(studentActor, assignment.id, { content: 'x' }, 'en');

    const queue = await service.listSubmissions(teacherActor, assignment.id, 'en');
    expect(queue.rows).toHaveLength(1);
    expect(queue.rows[0].student.fullName).toBe('Student One');
    expect(queue.missing.map((m) => m.id)).toEqual(['student-2']);
  });

  it('is closed to a teacher who does not own the assignment', async () => {
    const assignment = await createAssignment();
    await expect(
      service.listSubmissions(otherTeacherActor, assignment.id, 'en'),
    ).rejects.toMatchObject({ code: 'not_your_assignment' });
  });

  it('is readable by an admin', async () => {
    const assignment = await createAssignment();
    const queue = await service.listSubmissions({ id: 'admin-1', role: 'admin' }, assignment.id, 'en');
    expect(queue.assignment.id).toBe(assignment.id);
  });
});
