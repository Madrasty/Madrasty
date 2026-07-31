import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  aiConversations,
  aiMessages,
  chapters,
  enrollments,
  learningPrograms,
  lessons,
  parentChildren,
  translations,
  users,
} from '../../db/schema/index';

export interface ConversationRow {
  id: string;
  studentId: string;
  programId: string | null;
  lessonId: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationSummaryRow extends ConversationRow {
  messageCount: number;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  studentId: string;
  role: string;
  content: string;
  model: string | null;
  provider: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
}

export interface NewConversation {
  studentId: string;
  programId: string | null;
  lessonId: string | null;
  title: string | null;
}

export interface NewMessage {
  conversationId: string;
  studentId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  provider?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

// Whether a student may be served content at all (doc 01 §7, doc 11): an active
// account AND a guardian link that has actually been approved. A valid session
// token is NOT sufficient on its own.
export interface StudentGate {
  active: boolean;
  guardianApproved: boolean;
}

// The curriculum facts handed to the model as context. Titles are resolved from
// the `translations` table by the service, so the raw ids travel together here.
export interface LessonContextRow {
  lessonId: string;
  chapterId: string;
  programId: string;
  lessonType: string;
  gradeLevel: string | null;
}

export interface ProgramContextRow {
  programId: string;
  gradeLevel: string | null;
  semester: string | null;
}

export interface TranslationRow {
  entityType: string;
  entityId: string;
  locale: string;
  field: string;
  value: string;
}

export interface AiRepository {
  // --- access ---
  getStudentGate(studentId: string): Promise<StudentGate>;
  studentEnrolledIn(studentId: string, programId: string): Promise<boolean>;

  // --- curriculum context ---
  getLessonContext(lessonId: string): Promise<LessonContextRow | null>;
  getProgramContext(programId: string): Promise<ProgramContextRow | null>;
  listTranslations(entityType: string, entityIds: string[]): Promise<TranslationRow[]>;

  // --- conversations ---
  createConversation(input: NewConversation): Promise<ConversationRow>;
  getConversation(id: string): Promise<ConversationRow | null>;
  listConversations(studentId: string, limit: number): Promise<ConversationSummaryRow[]>;
  setConversationTitle(id: string, title: string): Promise<void>;
  touchConversation(id: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;

  // --- messages (append-only) ---
  listMessages(conversationId: string): Promise<MessageRow[]>;
  appendMessage(input: NewMessage): Promise<MessageRow>;
  // Quota: how many questions this student has asked since `since` — computed
  // from the ledger, never from a stored counter.
  countQuestionsSince(studentId: string, since: Date): Promise<number>;
}

const conversationColumns = {
  id: aiConversations.id,
  studentId: aiConversations.studentId,
  programId: aiConversations.programId,
  lessonId: aiConversations.lessonId,
  title: aiConversations.title,
  createdAt: aiConversations.createdAt,
  updatedAt: aiConversations.updatedAt,
};

const messageColumns = {
  id: aiMessages.id,
  conversationId: aiMessages.conversationId,
  studentId: aiMessages.studentId,
  role: aiMessages.role,
  content: aiMessages.content,
  model: aiMessages.model,
  provider: aiMessages.provider,
  inputTokens: aiMessages.inputTokens,
  outputTokens: aiMessages.outputTokens,
  createdAt: aiMessages.createdAt,
};

export class DrizzleAiRepository implements AiRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async getStudentGate(studentId: string): Promise<StudentGate> {
    const [account] = await this.db
      .select({ status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);

    const guardian = await this.db
      .select({ studentId: parentChildren.studentId })
      .from(parentChildren)
      .where(and(eq(parentChildren.studentId, studentId), isNotNull(parentChildren.approvedAt)))
      .limit(1);

    return {
      active: account?.status === 'active' && account.deletedAt === null,
      guardianApproved: guardian.length > 0,
    };
  }

  async studentEnrolledIn(studentId: string, programId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, studentId),
          eq(enrollments.programId, programId),
          eq(enrollments.status, 'active'),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async getLessonContext(lessonId: string): Promise<LessonContextRow | null> {
    const rows = await this.db
      .select({
        lessonId: lessons.id,
        chapterId: lessons.chapterId,
        programId: chapters.programId,
        lessonType: lessons.lessonType,
        gradeLevel: learningPrograms.gradeLevel,
      })
      .from(lessons)
      .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
      .innerJoin(learningPrograms, eq(chapters.programId, learningPrograms.id))
      .where(eq(lessons.id, lessonId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getProgramContext(programId: string): Promise<ProgramContextRow | null> {
    const rows = await this.db
      .select({
        programId: learningPrograms.id,
        gradeLevel: learningPrograms.gradeLevel,
        semester: learningPrograms.semester,
      })
      .from(learningPrograms)
      .where(eq(learningPrograms.id, programId))
      .limit(1);
    return rows[0] ?? null;
  }

  async listTranslations(entityType: string, entityIds: string[]): Promise<TranslationRow[]> {
    if (entityIds.length === 0) return [];
    return this.db
      .select({
        entityType: translations.entityType,
        entityId: translations.entityId,
        locale: translations.locale,
        field: translations.field,
        value: translations.value,
      })
      .from(translations)
      .where(
        and(
          eq(translations.entityType, entityType),
          inArray(translations.entityId, entityIds),
        ),
      );
  }

  async createConversation(input: NewConversation): Promise<ConversationRow> {
    const [row] = await this.db
      .insert(aiConversations)
      .values({
        studentId: input.studentId,
        programId: input.programId,
        lessonId: input.lessonId,
        title: input.title,
      })
      .returning(conversationColumns);
    return row;
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    const rows = await this.db
      .select(conversationColumns)
      .from(aiConversations)
      .where(eq(aiConversations.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async listConversations(studentId: string, limit: number): Promise<ConversationSummaryRow[]> {
    const rows = await this.db
      .select({
        ...conversationColumns,
        messageCount: sql<number>`count(${aiMessages.id})`,
      })
      .from(aiConversations)
      .leftJoin(aiMessages, eq(aiMessages.conversationId, aiConversations.id))
      .where(eq(aiConversations.studentId, studentId))
      .groupBy(aiConversations.id)
      .orderBy(desc(aiConversations.updatedAt))
      .limit(limit);
    return rows.map((row) => ({ ...row, messageCount: Number(row.messageCount) }));
  }

  async setConversationTitle(id: string, title: string): Promise<void> {
    await this.db
      .update(aiConversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(aiConversations.id, id));
  }

  async touchConversation(id: string): Promise<void> {
    await this.db
      .update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(eq(aiConversations.id, id));
  }

  async deleteConversation(id: string): Promise<void> {
    // Messages first — they carry the FK back to the conversation.
    await this.db.delete(aiMessages).where(eq(aiMessages.conversationId, id));
    await this.db.delete(aiConversations).where(eq(aiConversations.id, id));
  }

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    return this.db
      .select(messageColumns)
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(aiMessages.createdAt);
  }

  async appendMessage(input: NewMessage): Promise<MessageRow> {
    const [row] = await this.db
      .insert(aiMessages)
      .values({
        conversationId: input.conversationId,
        studentId: input.studentId,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        provider: input.provider ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
      })
      .returning(messageColumns);
    return row;
  }

  async countQuestionsSince(studentId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(aiMessages)
      .where(
        and(
          eq(aiMessages.studentId, studentId),
          eq(aiMessages.role, 'user'),
          gte(aiMessages.createdAt, since),
        ),
      );
    return Number(row?.count ?? 0);
  }
}
