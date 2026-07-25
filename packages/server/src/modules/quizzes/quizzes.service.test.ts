import { beforeEach, describe, expect, it } from 'vitest';
import { HttpError } from '../../lib/http-error';
import { QuizzesService, type Actor } from './quizzes.service';
import type {
  AttemptRow,
  LessonInfo,
  NewAttempt,
  NewQuestion,
  QuestionRow,
  QuizRow,
  QuizzesRepository,
} from './quizzes.repository';

// In-memory fake repo (same DI/fake pattern as the other modules).
class FakeRepo implements QuizzesRepository {
  quizzes: QuizRow[] = [];
  questions: QuestionRow[] = [];
  attempts: AttemptRow[] = [];
  lessons = new Map<string, LessonInfo>();
  programOwners = new Map<string, string>(); // programId -> teacherId
  enrolled = new Set<string>(); // `${studentId}:${programId}`
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
  async getQuizById(id: string) {
    return this.quizzes.find((q) => q.id === id) ?? null;
  }
  async getQuizByLesson(lessonId: string) {
    return this.quizzes.find((q) => q.lessonId === lessonId) ?? null;
  }
  async createQuiz(input: {
    lessonId: string;
    programId: string;
    teacherId: string;
    passingScore: number;
    timeLimitMinutes: number | null;
  }): Promise<QuizRow> {
    const row: QuizRow = {
      id: `q${++this.seq}`,
      lessonId: input.lessonId,
      programId: input.programId,
      teacherId: input.teacherId,
      passingScore: String(input.passingScore),
      timeLimitMinutes: input.timeLimitMinutes,
      generatedBy: 'teacher',
      createdAt: new Date(),
    };
    this.quizzes.push(row);
    return row;
  }
  async listQuestions(quizId: string) {
    return this.questions
      .filter((q) => q.quizId === quizId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }
  async nextQuestionOrder(quizId: string) {
    return this.questions.filter((q) => q.quizId === quizId).length;
  }
  async addQuestion(input: NewQuestion): Promise<QuestionRow> {
    const row: QuestionRow = {
      id: `qq${++this.seq}`,
      quizId: input.quizId,
      orderIndex: input.orderIndex,
      type: 'single_choice',
      prompt: input.prompt,
      options: input.options,
      correctOptionId: input.correctOptionId,
      points: String(input.points),
    };
    this.questions.push(row);
    return row;
  }
  async deleteQuestion(quizId: string, questionId: string) {
    const before = this.questions.length;
    this.questions = this.questions.filter(
      (q) => !(q.id === questionId && q.quizId === quizId),
    );
    return this.questions.length < before;
  }
  async insertAttempt(input: NewAttempt): Promise<AttemptRow> {
    const row: AttemptRow = {
      id: `a${++this.seq}`,
      quizId: input.quizId,
      studentId: input.studentId,
      answers: input.answers,
      score: String(input.score),
      maxScore: String(input.maxScore),
      percentage: String(input.percentage),
      passed: input.passed,
      submittedAt: new Date(),
    };
    this.attempts.push(row);
    return row;
  }
  async bestAttempt(quizId: string, studentId: string) {
    return (
      this.attempts
        .filter((a) => a.quizId === quizId && a.studentId === studentId)
        .sort((x, y) => Number(y.percentage) - Number(x.percentage))[0] ?? null
    );
  }
  async listAttempts(quizId: string, studentId: string) {
    return this.attempts.filter((a) => a.quizId === quizId && a.studentId === studentId);
  }
  async markLessonCompleted(studentId: string, lessonId: string) {
    this.completedLessons.push({ studentId, lessonId });
  }
}

const TEACHER = 'teacher-1';
const teacherActor: Actor = { id: TEACHER, role: 'teacher' };
const studentActor: Actor = { id: 'stud-1', role: 'student' };
const LOCALE = 'en';

async function expectHttp(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({ statusCode: status, code });
  await expect(promise).rejects.toBeInstanceOf(HttpError);
}

// Build a quiz with two questions (2 + 3 = 5 points), passing score 60%.
async function seedQuiz(repo: FakeRepo, svc: QuizzesService) {
  repo.lessons.set('lesson-1', { lessonType: 'quiz', programId: 'prog-1' });
  repo.programOwners.set('prog-1', TEACHER);
  const quiz = await svc.createQuiz(teacherActor, { lessonId: 'lesson-1', passingScore: 60 }, LOCALE);
  await svc.addQuestion(
    teacherActor,
    quiz.id,
    {
      prompt: { en: 'Q1' },
      options: [
        { id: 'a', text: { en: 'A' } },
        { id: 'b', text: { en: 'B' } },
      ],
      correctOptionId: 'a',
      points: 2,
    },
    LOCALE,
  );
  await svc.addQuestion(
    teacherActor,
    quiz.id,
    {
      prompt: { en: 'Q2' },
      options: [
        { id: 'a', text: { en: 'A' } },
        { id: 'b', text: { en: 'B' } },
      ],
      correctOptionId: 'b',
      points: 3,
    },
    LOCALE,
  );
  return quiz.id;
}

describe('QuizzesService — authoring', () => {
  let repo: FakeRepo;
  let svc: QuizzesService;
  beforeEach(() => {
    repo = new FakeRepo();
    svc = new QuizzesService(repo);
    repo.lessons.set('lesson-1', { lessonType: 'quiz', programId: 'prog-1' });
    repo.programOwners.set('prog-1', TEACHER);
  });

  it('creates a quiz on a quiz-type lesson the teacher owns', async () => {
    const quiz = await svc.createQuiz(teacherActor, { lessonId: 'lesson-1' }, LOCALE);
    expect(quiz.programId).toBe('prog-1');
    expect(quiz.passingScore).toBe(60);
  });

  it('rejects a non-quiz lesson', async () => {
    repo.lessons.set('lesson-2', { lessonType: 'recorded', programId: 'prog-1' });
    await expectHttp(
      svc.createQuiz(teacherActor, { lessonId: 'lesson-2' }, LOCALE),
      400,
      'not_a_quiz_lesson',
    );
  });

  it('rejects a program the teacher does not own', async () => {
    repo.programOwners.set('prog-1', 'someone-else');
    await expectHttp(svc.createQuiz(teacherActor, { lessonId: 'lesson-1' }, LOCALE), 403, 'not_your_program');
  });

  it('rejects a second quiz on the same lesson', async () => {
    await svc.createQuiz(teacherActor, { lessonId: 'lesson-1' }, LOCALE);
    await expectHttp(svc.createQuiz(teacherActor, { lessonId: 'lesson-1' }, LOCALE), 409, 'quiz_exists');
  });

  it('rejects a question whose correctOptionId matches no option', async () => {
    const quiz = await svc.createQuiz(teacherActor, { lessonId: 'lesson-1' }, LOCALE);
    await expectHttp(
      svc.addQuestion(
        teacherActor,
        quiz.id,
        { prompt: { en: 'Q' }, options: [{ id: 'a', text: { en: 'A' } }, { id: 'b', text: { en: 'B' } }], correctOptionId: 'z' },
        LOCALE,
      ),
      400,
      'invalid_correct_option',
    );
  });

  it('forbids a non-owner teacher from adding a question', async () => {
    const quiz = await svc.createQuiz(teacherActor, { lessonId: 'lesson-1' }, LOCALE);
    await expectHttp(
      svc.addQuestion(
        { id: 'teacher-2', role: 'teacher' },
        quiz.id,
        { prompt: { en: 'Q' }, options: [{ id: 'a', text: { en: 'A' } }, { id: 'b', text: { en: 'B' } }], correctOptionId: 'a' },
        LOCALE,
      ),
      403,
      'not_your_quiz',
    );
  });
});

describe('QuizzesService — taking & grading', () => {
  let repo: FakeRepo;
  let svc: QuizzesService;
  let quizId: string;
  beforeEach(async () => {
    repo = new FakeRepo();
    svc = new QuizzesService(repo);
    quizId = await seedQuiz(repo, svc);
    repo.enrolled.add(`${studentActor.id}:prog-1`);
  });

  it('hides correct answers from an enrolled student', async () => {
    const quiz = await svc.getQuiz(studentActor, quizId, LOCALE);
    expect(quiz.questions).toHaveLength(2);
    expect(quiz.questions.every((q) => q.correctOptionId === undefined)).toBe(true);
  });

  it('shows correct answers to the owning teacher', async () => {
    const quiz = await svc.getQuiz(teacherActor, quizId, LOCALE);
    expect(quiz.questions[0].correctOptionId).toBe('a');
  });

  it('forbids a non-enrolled student from viewing', async () => {
    await expectHttp(
      svc.getQuiz({ id: 'stranger', role: 'student' }, quizId, LOCALE),
      403,
      'not_enrolled',
    );
  });

  it('auto-grades a fully-correct attempt as 100% and passed', async () => {
    // Answer both correctly (need the question ids from the teacher view).
    const quiz = await svc.getQuiz(teacherActor, quizId, LOCALE);
    const [q1, q2] = quiz.questions;
    const graded = await svc.submitAttempt(
      studentActor,
      quizId,
      { answers: { [q1.id]: 'a', [q2.id]: 'b' } },
      LOCALE,
    );
    expect(graded.score).toBe(5);
    expect(graded.maxScore).toBe(5);
    expect(graded.percentage).toBe(100);
    expect(graded.passed).toBe(true);
  });

  it('grades a partial attempt and applies the passing threshold', async () => {
    const quiz = await svc.getQuiz(teacherActor, quizId, LOCALE);
    const [q1, q2] = quiz.questions;
    // Only Q2 correct → 3/5 = 60% → passes (threshold 60).
    const graded = await svc.submitAttempt(
      studentActor,
      quizId,
      { answers: { [q1.id]: 'b', [q2.id]: 'b' } },
      LOCALE,
    );
    expect(graded.score).toBe(3);
    expect(graded.percentage).toBe(60);
    expect(graded.passed).toBe(true);
  });

  it('marks the lesson completed on a passing attempt (quiz gating)', async () => {
    const quiz = await svc.getQuiz(teacherActor, quizId, LOCALE);
    const [q1, q2] = quiz.questions;
    await svc.submitAttempt(studentActor, quizId, { answers: { [q1.id]: 'a', [q2.id]: 'b' } }, LOCALE);
    expect(repo.completedLessons).toContainEqual({ studentId: studentActor.id, lessonId: 'lesson-1' });
  });

  it('does NOT complete the lesson on a failing attempt', async () => {
    const quiz = await svc.getQuiz(teacherActor, quizId, LOCALE);
    const [q1, q2] = quiz.questions;
    // Only Q1 (2 pts) correct → 40% → fails.
    const graded = await svc.submitAttempt(
      studentActor,
      quizId,
      { answers: { [q1.id]: 'a', [q2.id]: 'a' } },
      LOCALE,
    );
    expect(graded.passed).toBe(false);
    expect(repo.completedLessons).toHaveLength(0);
  });

  it('forbids a non-enrolled student from submitting', async () => {
    await expectHttp(
      svc.submitAttempt({ id: 'stranger', role: 'student' }, quizId, { answers: {} }, LOCALE),
      403,
      'not_enrolled',
    );
  });

  it('reveals the correct option in the per-question breakdown after submit', async () => {
    const quiz = await svc.getQuiz(teacherActor, quizId, LOCALE);
    const [q1] = quiz.questions;
    const graded = await svc.submitAttempt(studentActor, quizId, { answers: { [q1.id]: 'b' } }, LOCALE);
    const q1Result = graded.perQuestion.find((p) => p.questionId === q1.id);
    expect(q1Result?.correctOptionId).toBe('a');
    expect(q1Result?.correct).toBe(false);
  });
});
