import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import {
  AiProviderError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
} from './ai.provider';
import { AiService, type Actor } from './ai.service';
import type {
  AiRepository,
  ConversationRow,
  ConversationSummaryRow,
  LessonContextRow,
  MessageRow,
  NewConversation,
  NewMessage,
  ProgramContextRow,
  StudentGate,
  TranslationRow,
} from './ai.repository';

// In-memory fake repo (same DI/fake pattern as the other modules).
class FakeRepo implements AiRepository {
  conversations: ConversationRow[] = [];
  messages: MessageRow[] = [];
  gates = new Map<string, StudentGate>();
  enrolled = new Set<string>(); // `${studentId}:${programId}`
  lessons = new Map<string, LessonContextRow>();
  programs = new Map<string, ProgramContextRow>();
  translations: TranslationRow[] = [];
  private seq = 0;

  async getStudentGate(studentId: string) {
    return this.gates.get(studentId) ?? { active: false, guardianApproved: false };
  }
  async studentEnrolledIn(studentId: string, programId: string) {
    return this.enrolled.has(`${studentId}:${programId}`);
  }
  async getLessonContext(lessonId: string) {
    return this.lessons.get(lessonId) ?? null;
  }
  async getProgramContext(programId: string) {
    return this.programs.get(programId) ?? null;
  }
  async listTranslations(entityType: string, entityIds: string[]) {
    return this.translations.filter(
      (row) => row.entityType === entityType && entityIds.includes(row.entityId),
    );
  }
  async createConversation(input: NewConversation): Promise<ConversationRow> {
    const now = new Date();
    const row: ConversationRow = {
      id: `conv${++this.seq}`,
      studentId: input.studentId,
      programId: input.programId,
      lessonId: input.lessonId,
      title: input.title,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.push(row);
    return row;
  }
  async getConversation(id: string) {
    return this.conversations.find((c) => c.id === id) ?? null;
  }
  async listConversations(studentId: string, limit: number): Promise<ConversationSummaryRow[]> {
    return this.conversations
      .filter((c) => c.studentId === studentId)
      .slice(0, limit)
      .map((c) => ({
        ...c,
        messageCount: this.messages.filter((m) => m.conversationId === c.id).length,
      }));
  }
  async setConversationTitle(id: string, title: string) {
    const row = this.conversations.find((c) => c.id === id);
    if (row) {
      row.title = title;
      row.updatedAt = new Date();
    }
  }
  async touchConversation(id: string) {
    const row = this.conversations.find((c) => c.id === id);
    if (row) row.updatedAt = new Date();
  }
  async deleteConversation(id: string) {
    this.messages = this.messages.filter((m) => m.conversationId !== id);
    this.conversations = this.conversations.filter((c) => c.id !== id);
  }
  async listMessages(conversationId: string) {
    return this.messages.filter((m) => m.conversationId === conversationId);
  }
  async appendMessage(input: NewMessage): Promise<MessageRow> {
    const row: MessageRow = {
      id: `msg${++this.seq}`,
      conversationId: input.conversationId,
      studentId: input.studentId,
      role: input.role,
      content: input.content,
      model: input.model ?? null,
      provider: input.provider ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      createdAt: new Date(),
    };
    this.messages.push(row);
    return row;
  }
  async countQuestionsSince(studentId: string, since: Date) {
    return this.messages.filter(
      (m) => m.studentId === studentId && m.role === 'user' && m.createdAt >= since,
    ).length;
  }
}

// Records what the provider was asked, so the context-building and
// prompt-isolation rules can be asserted without a network call.
class SpyProvider implements AiProvider {
  readonly name = 'spy';
  lastRequest: AiCompletionRequest | null = null;
  failWith: Error | null = null;
  calls = 0;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    this.calls += 1;
    this.lastRequest = request;
    if (this.failWith) throw this.failWith;
    return {
      text: 'Here is a step-by-step explanation.',
      model: 'test-model',
      inputTokens: 120,
      outputTokens: 45,
      stopReason: 'end_turn',
    };
  }
}

const STUDENT: Actor = { id: 'student-1', role: 'student' };
const OTHER_STUDENT: Actor = { id: 'student-2', role: 'student' };
const TEACHER: Actor = { id: 'teacher-1', role: 'teacher' };
const ADMIN: Actor = { id: 'admin-1', role: 'admin' };

const LOCALE = 'en';

describe('AiService', () => {
  let repo: FakeRepo;
  let provider: SpyProvider;
  let service: AiService;

  beforeEach(() => {
    repo = new FakeRepo();
    provider = new SpyProvider();
    service = new AiService(repo, provider);

    repo.gates.set(STUDENT.id, { active: true, guardianApproved: true });
    repo.gates.set(OTHER_STUDENT.id, { active: true, guardianApproved: true });
    repo.lessons.set('lesson-1', {
      lessonId: 'lesson-1',
      chapterId: 'chapter-1',
      programId: 'program-1',
      lessonType: 'recorded',
      gradeLevel: 'g9',
    });
    repo.programs.set('program-1', {
      programId: 'program-1',
      gradeLevel: 'g9',
      semester: 'first',
    });
    repo.translations.push(
      { entityType: 'learning_program', entityId: 'program-1', locale: 'en', field: 'title', value: 'Algebra I' },
      { entityType: 'lesson', entityId: 'lesson-1', locale: 'en', field: 'title', value: 'Quadratic equations' },
      { entityType: 'chapter', entityId: 'chapter-1', locale: 'en', field: 'title', value: 'Equations' },
    );
    repo.enrolled.add(`${STUDENT.id}:program-1`);
  });

  const startScoped = () =>
    service.startConversation(STUDENT, { lessonId: 'lesson-1' }, LOCALE);

  it('answers a question and records both turns with usage', async () => {
    const conversation = await startScoped();
    const result = await service.ask(STUDENT, conversation.id, { question: 'Why is b²-4ac used?' }, LOCALE);

    expect(result.question.content).toBe('Why is b²-4ac used?');
    expect(result.answer.content).toBe('Here is a step-by-step explanation.');
    expect(result.answer.tokens).toEqual({ input: 120, output: 45 });
    expect(result.usage.used).toBe(1);
    expect(result.usage.remaining).toBe(config.AI_DAILY_QUESTION_LIMIT - 1);

    const stored = await repo.listMessages(conversation.id);
    expect(stored.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('sends curriculum context in the system prompt, and the question only as a user turn', async () => {
    const conversation = await startScoped();
    await service.ask(STUDENT, conversation.id, { question: 'Explain the discriminant' }, LOCALE);

    const request = provider.lastRequest!;
    expect(request.system).toContain('Algebra I');
    expect(request.system).toContain('Quadratic equations');
    expect(request.system).toContain('Equations');
    // The student's text must never leak into the operator channel.
    expect(request.system).not.toContain('Explain the discriminant');
    expect(request.turns).toEqual([{ role: 'user', content: 'Explain the discriminant' }]);
  });

  it('replays prior turns, bounded and always starting on a user turn', async () => {
    const conversation = await startScoped();
    await service.ask(STUDENT, conversation.id, { question: 'First question' }, LOCALE);
    await service.ask(STUDENT, conversation.id, { question: 'Follow-up' }, LOCALE);

    const turns = provider.lastRequest!.turns;
    expect(turns[0].role).toBe('user');
    expect(turns.map((t) => t.content)).toEqual([
      'First question',
      'Here is a step-by-step explanation.',
      'Follow-up',
    ]);
  });

  it('titles the conversation from the first question only', async () => {
    const conversation = await startScoped();
    await service.ask(STUDENT, conversation.id, { question: 'What is a root?' }, LOCALE);
    await service.ask(STUDENT, conversation.id, { question: 'And a factor?' }, LOCALE);

    expect((await repo.getConversation(conversation.id))!.title).toBe('What is a root?');
  });

  it('refuses a student whose guardian link is not approved', async () => {
    repo.gates.set(STUDENT.id, { active: true, guardianApproved: false });
    await expect(startScoped()).rejects.toMatchObject({
      code: 'guardian_approval_required',
      statusCode: 403,
    });
  });

  it('refuses a suspended student account', async () => {
    repo.gates.set(STUDENT.id, { active: false, guardianApproved: true });
    await expect(startScoped()).rejects.toMatchObject({ code: 'student_not_active' });
  });

  it('refuses to scope a conversation to a program the student is not enrolled in', async () => {
    repo.enrolled.clear();
    await expect(startScoped()).rejects.toMatchObject({ code: 'not_enrolled', statusCode: 403 });
  });

  it('stops answering when enrollment is revoked mid-thread', async () => {
    const conversation = await startScoped();
    await service.ask(STUDENT, conversation.id, { question: 'First' }, LOCALE);

    repo.enrolled.clear();
    await expect(
      service.ask(STUDENT, conversation.id, { question: 'Second' }, LOCALE),
    ).rejects.toMatchObject({ code: 'not_enrolled' });
  });

  it('allows an unscoped conversation with no enrollment', async () => {
    repo.enrolled.clear();
    const conversation = await service.startConversation(STUDENT, {}, LOCALE);
    const result = await service.ask(STUDENT, conversation.id, { question: 'How do I revise?' }, LOCALE);

    expect(result.answer.content).toBeTruthy();
    expect(provider.lastRequest!.system).toContain('general study help');
  });

  it('refuses non-students', async () => {
    await expect(
      service.startConversation(TEACHER, { lessonId: 'lesson-1' }, LOCALE),
    ).rejects.toMatchObject({ code: 'students_only', statusCode: 403 });
  });

  it('refuses to read or ask in someone else’s conversation', async () => {
    const conversation = await startScoped();
    await expect(
      service.getConversation(OTHER_STUDENT, conversation.id, LOCALE),
    ).rejects.toMatchObject({ code: 'not_your_conversation' });
    await expect(
      service.ask(OTHER_STUDENT, conversation.id, { question: 'Hi' }, LOCALE),
    ).rejects.toMatchObject({ code: 'not_your_conversation' });
  });

  it('lets an admin read a thread for audit but never delete it', async () => {
    const conversation = await startScoped();
    await service.ask(STUDENT, conversation.id, { question: 'Explain roots' }, LOCALE);

    const view = await service.getConversation(ADMIN, conversation.id, LOCALE);
    expect(view.messages).toHaveLength(2);
    await expect(service.deleteConversation(ADMIN, conversation.id)).rejects.toMatchObject({
      code: 'not_your_conversation',
    });
  });

  it('enforces the daily question cap', async () => {
    const conversation = await startScoped();
    for (let i = 0; i < config.AI_DAILY_QUESTION_LIMIT; i += 1) {
      await service.ask(STUDENT, conversation.id, { question: `Question ${i}` }, LOCALE);
    }
    const callsAtLimit = provider.calls;

    await expect(
      service.ask(STUDENT, conversation.id, { question: 'One too many' }, LOCALE),
    ).rejects.toMatchObject({ code: 'ai_daily_limit_reached', statusCode: 429 });
    // The provider must not be called once the budget is spent.
    expect(provider.calls).toBe(callsAtLimit);
  });

  it('writes nothing and spends no quota when the provider fails', async () => {
    const conversation = await startScoped();
    provider.failWith = new AiProviderError('busy', true);

    await expect(
      service.ask(STUDENT, conversation.id, { question: 'Anything' }, LOCALE),
    ).rejects.toMatchObject({ code: 'ai_busy', statusCode: 503 });

    expect(await repo.listMessages(conversation.id)).toHaveLength(0);
    expect((await service.getUsage(STUDENT)).used).toBe(0);
  });

  it('surfaces a non-retryable provider failure distinctly', async () => {
    const conversation = await startScoped();
    provider.failWith = new AiProviderError('declined', false);

    await expect(
      service.ask(STUDENT, conversation.id, { question: 'Anything' }, LOCALE),
    ).rejects.toMatchObject({ code: 'ai_failed', statusCode: 502 });
  });

  it('rejects a blank question before calling the provider', async () => {
    const conversation = await startScoped();
    await expect(
      service.ask(STUDENT, conversation.id, { question: '   ' }, LOCALE),
    ).rejects.toBeInstanceOf(HttpError);
    expect(provider.calls).toBe(0);
  });

  it('lists my conversations with titles resolved for the locale', async () => {
    const conversation = await startScoped();
    await service.ask(STUDENT, conversation.id, { question: 'Explain roots' }, LOCALE);

    const { conversations, usage } = await service.listConversations(STUDENT, LOCALE);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].programTitle).toBe('Algebra I');
    expect(conversations[0].lessonTitle).toBe('Quadratic equations');
    expect(conversations[0].messageCount).toBe(2);
    expect(usage.used).toBe(1);
  });

  it('deletes a conversation with its messages', async () => {
    const conversation = await startScoped();
    await service.ask(STUDENT, conversation.id, { question: 'Explain roots' }, LOCALE);

    await service.deleteConversation(STUDENT, conversation.id);
    expect(await repo.getConversation(conversation.id)).toBeNull();
    expect(repo.messages).toHaveLength(0);
  });
});
