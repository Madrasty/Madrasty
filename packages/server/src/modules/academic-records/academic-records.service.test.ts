import { beforeEach, describe, expect, it } from 'vitest';
import { HttpError } from '../../lib/http-error';
import { AcademicRecordsService, type Actor } from './academic-records.service';
import type {
  AcademicRecordsRepository,
  CreateExamInput,
  ExamRow,
  HomeworkAssignedRow,
  HomeworkSubmissionStatRow,
  QuizStatRow,
  ResultRow,
  StudentResultRow,
  SubjectTranslationRow,
  UserBrief,
} from './academic-records.repository';

// In-memory fake repo (same DI/fake pattern as the other modules).
class FakeRepo implements AcademicRecordsRepository {
  exams: ExamRow[] = [];
  results: ResultRow[] = [];
  subjectIds = new Set<string>(['subj-math']);
  programOwners = new Map<string, string>(); // programId -> teacherId
  enrollments = new Map<string, UserBrief[]>(); // programId -> students
  approved = new Set<string>(); // `${parentId}:${studentId}`
  names = new Map<string, string>();
  slugs = new Map<string, string | null>([['subj-math', 'math']]);
  translations: SubjectTranslationRow[] = [];
  quizStats = new Map<string, QuizStatRow[]>();
  homeworkAssigned = new Map<string, HomeworkAssignedRow[]>();
  homeworkSubmissions = new Map<string, HomeworkSubmissionStatRow[]>();
  private seq = 0;

  async createExam(input: CreateExamInput): Promise<ExamRow> {
    const row: ExamRow = {
      id: `e${++this.seq}`,
      teacherId: input.teacherId,
      subjectId: input.subjectId,
      programId: input.programId,
      title: input.title,
      maxScore: String(input.maxScore),
      weight: String(input.weight),
      term: input.term,
      createdAt: new Date(),
    };
    this.exams.push(row);
    return row;
  }
  async getExamById(id: string) {
    return this.exams.find((e) => e.id === id) ?? null;
  }
  async listExamsByTeacher(teacherId: string) {
    return this.exams.filter((e) => e.teacherId === teacherId);
  }
  async teacherOwnsProgram(teacherId: string, programId: string) {
    return this.programOwners.get(programId) === teacherId;
  }
  async subjectExists(subjectId: string) {
    return this.subjectIds.has(subjectId);
  }
  async upsertResult(
    examId: string,
    studentId: string,
    score: number,
    comment: string | null,
    gradedBy: string,
  ): Promise<ResultRow> {
    let row = this.results.find((r) => r.examId === examId && r.studentId === studentId);
    if (row) {
      row.score = String(score);
      row.teacherComment = comment;
      row.gradedBy = gradedBy;
      row.gradedAt = new Date();
    } else {
      row = {
        id: `r${++this.seq}`,
        examId,
        studentId,
        score: String(score),
        teacherComment: comment,
        gradedBy,
        gradedAt: new Date(),
      };
      this.results.push(row);
    }
    return row;
  }
  async listResultsForExam(examId: string) {
    return this.results.filter((r) => r.examId === examId);
  }
  async listResultsForStudent(studentId: string, term?: string): Promise<StudentResultRow[]> {
    return this.results
      .filter((r) => r.studentId === studentId)
      .map((r) => {
        const exam = this.exams.find((e) => e.id === r.examId)!;
        return {
          examId: exam.id,
          subjectId: exam.subjectId,
          title: exam.title,
          maxScore: exam.maxScore,
          weight: exam.weight,
          term: exam.term,
          score: r.score,
          teacherComment: r.teacherComment,
          gradedAt: r.gradedAt,
        };
      })
      .filter((r) => (term ? r.term === term : true));
  }
  async listEnrolledStudents(programId: string) {
    return this.enrollments.get(programId) ?? [];
  }
  async isApprovedParentOf(parentId: string, studentId: string) {
    return this.approved.has(`${parentId}:${studentId}`);
  }
  async getUsersBrief(ids: string[]): Promise<UserBrief[]> {
    return ids.map((id) => ({ id, fullName: this.names.get(id) ?? null }));
  }
  async getSubjectSlugs(ids: string[]) {
    return ids.map((id) => ({ id, slug: this.slugs.get(id) ?? null }));
  }
  async getSubjectTranslations(ids: string[]) {
    return this.translations.filter((t) => ids.includes(t.entityId));
  }
  // Report-card roll-ups — keyed by student, as the real queries are.
  async listQuizStatsForStudent(studentId: string) {
    return this.quizStats.get(studentId) ?? [];
  }
  async listHomeworkAssignedForStudent(studentId: string) {
    return this.homeworkAssigned.get(studentId) ?? [];
  }
  async listHomeworkSubmissionsForStudent(studentId: string) {
    return this.homeworkSubmissions.get(studentId) ?? [];
  }
}

const TEACHER = 'teacher-1';
const teacherActor: Actor = { id: TEACHER, role: 'teacher' };
const LOCALE = 'en';

async function expectHttp(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({ statusCode: status, code });
  await expect(promise).rejects.toBeInstanceOf(HttpError);
}

describe('AcademicRecordsService — createExam', () => {
  let repo: FakeRepo;
  let svc: AcademicRecordsService;
  beforeEach(() => {
    repo = new FakeRepo();
    svc = new AcademicRecordsService(repo);
  });

  it('creates an exam for a valid subject', async () => {
    const view = await svc.createExam(
      teacherActor,
      { subjectId: 'subj-math', title: { en: 'Midterm' }, maxScore: 100 },
      LOCALE,
    );
    expect(view.title).toBe('Midterm');
    expect(view.maxScore).toBe(100);
    expect(view.weight).toBe(1);
    expect(repo.exams).toHaveLength(1);
  });

  it('rejects an unknown subject', async () => {
    await expectHttp(
      svc.createExam(teacherActor, { subjectId: 'nope', title: { en: 'X' }, maxScore: 10 }, LOCALE),
      400,
      'subject_not_found',
    );
  });

  it('rejects a program the teacher does not own', async () => {
    repo.programOwners.set('prog-1', 'someone-else');
    await expectHttp(
      svc.createExam(
        teacherActor,
        { subjectId: 'subj-math', programId: 'prog-1', title: { en: 'X' }, maxScore: 10 },
        LOCALE,
      ),
      403,
      'not_your_program',
    );
  });

  it('rejects a non-positive maxScore', async () => {
    await expectHttp(
      svc.createExam(teacherActor, { subjectId: 'subj-math', title: { en: 'X' }, maxScore: 0 }, LOCALE),
      400,
      'invalid_max_score',
    );
  });

  it('rejects an empty title', async () => {
    await expectHttp(
      svc.createExam(teacherActor, { subjectId: 'subj-math', title: { en: '  ' }, maxScore: 10 }, LOCALE),
      400,
      'title_required',
    );
  });
});

describe('AcademicRecordsService — recordResult + gradebook', () => {
  let repo: FakeRepo;
  let svc: AcademicRecordsService;
  let examId: string;
  beforeEach(async () => {
    repo = new FakeRepo();
    svc = new AcademicRecordsService(repo);
    repo.programOwners.set('prog-1', TEACHER);
    repo.enrollments.set('prog-1', [
      { id: 'stud-a', fullName: 'Student A' },
      { id: 'stud-b', fullName: 'Student B' },
    ]);
    const exam = await svc.createExam(
      teacherActor,
      { subjectId: 'subj-math', programId: 'prog-1', title: { en: 'Midterm' }, maxScore: 50 },
      LOCALE,
    );
    examId = exam.id;
  });

  it('records a grade and computes percentage', async () => {
    const row = await svc.recordResult(teacherActor, examId, { studentId: 'stud-a', score: 40 }, LOCALE);
    expect(row.result?.score).toBe(40);
    expect(row.result?.percentage).toBe(80); // 40/50
  });

  it('re-grading updates the same result (upsert)', async () => {
    await svc.recordResult(teacherActor, examId, { studentId: 'stud-a', score: 40 }, LOCALE);
    await svc.recordResult(teacherActor, examId, { studentId: 'stud-a', score: 45 }, LOCALE);
    expect(repo.results.filter((r) => r.studentId === 'stud-a')).toHaveLength(1);
    expect(repo.results[0].score).toBe('45');
  });

  it('rejects a score above maxScore', async () => {
    await expectHttp(
      svc.recordResult(teacherActor, examId, { studentId: 'stud-a', score: 51 }, LOCALE),
      400,
      'score_out_of_range',
    );
  });

  it('forbids a teacher who does not own the exam from grading', async () => {
    await expectHttp(
      svc.recordResult({ id: 'teacher-2', role: 'teacher' }, examId, { studentId: 'stud-a', score: 10 }, LOCALE),
      403,
      'not_your_exam',
    );
  });

  it('gradebook lists the full program roster with results merged', async () => {
    await svc.recordResult(teacherActor, examId, { studentId: 'stud-a', score: 25 }, LOCALE);
    const gradebook = await svc.getGradebook(teacherActor, examId, LOCALE);
    expect(gradebook.rows).toHaveLength(2);
    const a = gradebook.rows.find((r) => r.student.id === 'stud-a');
    const b = gradebook.rows.find((r) => r.student.id === 'stud-b');
    expect(a?.result?.score).toBe(25);
    expect(b?.result).toBeNull();
  });

  it('lets an admin view a gradebook read-only but not a stranger teacher', async () => {
    const asAdmin = await svc.getGradebook({ id: 'admin-1', role: 'admin' }, examId, LOCALE);
    expect(asAdmin.exam.id).toBe(examId);
    await expectHttp(
      svc.getGradebook({ id: 'teacher-2', role: 'teacher' }, examId, LOCALE),
      403,
      'not_your_exam',
    );
  });
});

describe('AcademicRecordsService — report card', () => {
  let repo: FakeRepo;
  let svc: AcademicRecordsService;
  beforeEach(async () => {
    repo = new FakeRepo();
    svc = new AcademicRecordsService(repo);
    repo.names.set('stud-a', 'Student A');
    // Two math exams for stud-a: 80% weight 1, 50% weight 3 → weighted 57.5.
    const a = await svc.createExam(
      teacherActor,
      { subjectId: 'subj-math', title: { en: 'A' }, maxScore: 100, weight: 1 },
      LOCALE,
    );
    const b = await svc.createExam(
      teacherActor,
      { subjectId: 'subj-math', title: { en: 'B' }, maxScore: 50, weight: 3 },
      LOCALE,
    );
    await svc.recordResult(teacherActor, a.id, { studentId: 'stud-a', score: 80 }, LOCALE);
    await svc.recordResult(teacherActor, b.id, { studentId: 'stud-a', score: 25 }, LOCALE);
  });

  it('computes weighted subject + overall averages', async () => {
    const card = await svc.getReportCard({ id: 'stud-a', role: 'student' }, 'stud-a', undefined, LOCALE);
    expect(card.subjects).toHaveLength(1);
    expect(card.subjects[0].subjectId).toBe('subj-math');
    expect(card.subjects[0].average).toBe(57.5);
    expect(card.subjects[0].exams).toHaveLength(2);
    expect(card.overallAverage).toBe(57.5);
  });

  it('falls back to the subject slug when no translation exists', async () => {
    const card = await svc.getReportCard({ id: 'stud-a', role: 'student' }, 'stud-a', undefined, LOCALE);
    expect(card.subjects[0].subjectName).toBe('math');
  });

  it('resolves the subject name from translations when present', async () => {
    repo.translations.push({ entityId: 'subj-math', locale: 'en', field: 'name', value: 'Mathematics' });
    const card = await svc.getReportCard({ id: 'stud-a', role: 'student' }, 'stud-a', undefined, LOCALE);
    expect(card.subjects[0].subjectName).toBe('Mathematics');
  });

  it('lets an approved parent view, but forbids a stranger', async () => {
    repo.approved.add('parent-1:stud-a');
    const card = await svc.getReportCard({ id: 'parent-1', role: 'parent' }, 'stud-a', undefined, LOCALE);
    expect(card.overallAverage).toBe(57.5);
    await expectHttp(
      svc.getReportCard({ id: 'parent-2', role: 'parent' }, 'stud-a', undefined, LOCALE),
      403,
      'not_authorized',
    );
  });

  it('returns an empty card (null overall) when the student has no grades', async () => {
    const card = await svc.getReportCard({ id: 'stud-z', role: 'student' }, 'stud-z', undefined, LOCALE);
    expect(card.subjects).toHaveLength(0);
    expect(card.overallAverage).toBeNull();
  });

  it('reports zeroed quiz/homework summaries for an exams-only subject', async () => {
    const card = await svc.getReportCard({ id: 'stud-a', role: 'student' }, 'stud-a', undefined, LOCALE);
    expect(card.subjects[0].quizzes).toEqual({ count: 0, average: null });
    expect(card.subjects[0].homework).toMatchObject({
      assigned: 0,
      submitted: 0,
      completionRate: null,
      average: null,
    });
  });
});

// The doc 10 §3.1 roll-up: exams + quiz averages + homework completion, per
// subject. Attendance is still missing (needs steps 8–9).
describe('AcademicRecordsService — report card roll-ups', () => {
  let repo: FakeRepo;
  let svc: AcademicRecordsService;
  const student = { id: 'stud-a', role: 'student' as const };

  beforeEach(() => {
    repo = new FakeRepo();
    svc = new AcademicRecordsService(repo);
  });

  it('averages the best attempt per quiz', async () => {
    repo.quizStats.set('stud-a', [
      { subjectId: 'subj-math', quizId: 'q1', bestPercentage: '90' },
      { subjectId: 'subj-math', quizId: 'q2', bestPercentage: '60' },
    ]);
    const card = await svc.getReportCard(student, 'stud-a', undefined, LOCALE);
    expect(card.subjects[0].quizzes).toEqual({ count: 2, average: 75 });
  });

  it('computes completion, on-time and graded averages for homework', async () => {
    repo.homeworkAssigned.set('stud-a', [{ subjectId: 'subj-math', assigned: 4 }]);
    repo.homeworkSubmissions.set('stud-a', [
      { subjectId: 'subj-math', status: 'graded', grade: '18', maxGrade: '20' }, // 90%
      { subjectId: 'subj-math', status: 'graded', grade: '14', maxGrade: '20' }, // 70%
      { subjectId: 'subj-math', status: 'late', grade: null, maxGrade: '20' },
    ]);
    const card = await svc.getReportCard(student, 'stud-a', undefined, LOCALE);
    expect(card.subjects[0].homework).toEqual({
      assigned: 4,
      submitted: 3,
      late: 1,
      graded: 2,
      completionRate: 75, // 3 of 4
      onTimeRate: 50, // 2 of 4 on time
      average: 80, // mean of 90% and 70%
    });
  });

  it('surfaces a subject the student has ignored — 0% completion, no exams', async () => {
    repo.homeworkAssigned.set('stud-a', [{ subjectId: 'subj-math', assigned: 3 }]);
    const card = await svc.getReportCard(student, 'stud-a', undefined, LOCALE);
    expect(card.subjects).toHaveLength(1);
    expect(card.subjects[0].average).toBeNull(); // no exams in this subject
    expect(card.subjects[0].homework.completionRate).toBe(0);
  });

  it('keeps the headline average exams-only', async () => {
    repo.quizStats.set('stud-a', [
      { subjectId: 'subj-math', quizId: 'q1', bestPercentage: '100' },
    ]);
    const card = await svc.getReportCard(student, 'stud-a', undefined, LOCALE);
    // A perfect quiz must not invent an overall average out of zero exams.
    expect(card.overallAverage).toBeNull();
    expect(card.quizzesAndHomeworkAreAllTime).toBe(true);
  });

  it('never reports over 100% completion when submissions outlive enrollment', async () => {
    repo.homeworkAssigned.set('stud-a', [{ subjectId: 'subj-math', assigned: 1 }]);
    repo.homeworkSubmissions.set('stud-a', [
      { subjectId: 'subj-math', status: 'submitted', grade: null, maxGrade: '20' },
      { subjectId: 'subj-math', status: 'submitted', grade: null, maxGrade: '20' },
    ]);
    const card = await svc.getReportCard(student, 'stud-a', undefined, LOCALE);
    expect(card.subjects[0].homework.completionRate).toBe(100);
    expect(card.subjects[0].homework.onTimeRate).toBe(100);
  });
});
