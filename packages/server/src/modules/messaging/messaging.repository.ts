import { and, desc, eq, inArray, isNull, isNotNull, ne, sql } from 'drizzle-orm';
import type { UserRole } from '@madrasty/shared';
import { db as defaultDb, type Database } from '../../db/client';
import {
  conversations,
  messages,
  users,
  parentChildren,
  enrollments,
  learningPrograms,
} from '../../db/schema/index';

export interface ConversationRow {
  id: string;
  parentId: string;
  teacherId: string;
  studentId: string;
  status: string;
  createdAt: Date;
  lastMessageAt: Date | null;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface UserBrief {
  id: string;
  fullName: string | null;
}

// Data access for parent–teacher messaging. All permission-relevant lookups
// (guardian link, teacher-teaches-student) live here so the service reads as
// pure policy (doc 10 §6).
export interface MessagingRepository {
  isApprovedParentOf(parentId: string, studentId: string): Promise<boolean>;
  teacherTeachesStudent(teacherId: string, studentId: string): Promise<boolean>;
  userHasRole(userId: string, role: UserRole): Promise<boolean>;

  findConversation(
    parentId: string,
    teacherId: string,
    studentId: string,
  ): Promise<ConversationRow | null>;
  createConversation(
    parentId: string,
    teacherId: string,
    studentId: string,
  ): Promise<ConversationRow>;
  getConversationById(id: string): Promise<ConversationRow | null>;
  listConversationsForParent(parentId: string): Promise<ConversationRow[]>;
  listConversationsForTeacher(teacherId: string): Promise<ConversationRow[]>;
  listAllConversations(): Promise<ConversationRow[]>;

  listMessages(conversationId: string): Promise<MessageRow[]>;
  insertMessage(conversationId: string, senderId: string, body: string): Promise<MessageRow>;
  markRead(conversationId: string, readerId: string): Promise<void>;

  getUsersBrief(ids: string[]): Promise<UserBrief[]>;
  getLastMessages(conversationIds: string[]): Promise<Map<string, MessageRow>>;
  getUnreadCounts(conversationIds: string[], readerId: string): Promise<Map<string, number>>;

  // Distinct (teacher, student) pairs a parent may message: derived from the
  // parent's APPROVED children and the teachers of programs they're enrolled in.
  listParentContactPairs(
    parentId: string,
  ): Promise<Array<{ teacherId: string; studentId: string }>>;
}

const conversationColumns = {
  id: conversations.id,
  parentId: conversations.parentId,
  teacherId: conversations.teacherId,
  studentId: conversations.studentId,
  status: conversations.status,
  createdAt: conversations.createdAt,
  lastMessageAt: conversations.lastMessageAt,
};

const messageColumns = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderId: messages.senderId,
  body: messages.body,
  readAt: messages.readAt,
  createdAt: messages.createdAt,
};

// Inbox ordering: most recent activity first; brand-new empty threads
// (lastMessageAt NULL) sort last by falling back to creation time.
const recencyOrder = sql`${conversations.lastMessageAt} DESC NULLS LAST, ${conversations.createdAt} DESC`;

export class DrizzleMessagingRepository implements MessagingRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async isApprovedParentOf(parentId: string, studentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ studentId: parentChildren.studentId })
      .from(parentChildren)
      .where(
        and(
          eq(parentChildren.parentId, parentId),
          eq(parentChildren.studentId, studentId),
          isNotNull(parentChildren.approvedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async teacherTeachesStudent(teacherId: string, studentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .innerJoin(learningPrograms, eq(enrollments.programId, learningPrograms.id))
      .where(and(eq(enrollments.studentId, studentId), eq(learningPrograms.teacherId, teacherId)))
      .limit(1);
    return rows.length > 0;
  }

  async userHasRole(userId: string, role: UserRole): Promise<boolean> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.role, role)))
      .limit(1);
    return rows.length > 0;
  }

  async findConversation(
    parentId: string,
    teacherId: string,
    studentId: string,
  ): Promise<ConversationRow | null> {
    const rows = await this.db
      .select(conversationColumns)
      .from(conversations)
      .where(
        and(
          eq(conversations.parentId, parentId),
          eq(conversations.teacherId, teacherId),
          eq(conversations.studentId, studentId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async createConversation(
    parentId: string,
    teacherId: string,
    studentId: string,
  ): Promise<ConversationRow> {
    // Race-safe find-or-create: the UNIQUE(parent,teacher,student) index makes a
    // concurrent duplicate a no-op, then we return the existing row.
    const inserted = await this.db
      .insert(conversations)
      .values({ parentId, teacherId, studentId })
      .onConflictDoNothing()
      .returning(conversationColumns);
    if (inserted[0]) return inserted[0];
    const existing = await this.findConversation(parentId, teacherId, studentId);
    if (!existing) throw new Error('conversation upsert failed to resolve');
    return existing;
  }

  async getConversationById(id: string): Promise<ConversationRow | null> {
    const rows = await this.db
      .select(conversationColumns)
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async listConversationsForParent(parentId: string): Promise<ConversationRow[]> {
    return this.db
      .select(conversationColumns)
      .from(conversations)
      .where(eq(conversations.parentId, parentId))
      .orderBy(recencyOrder);
  }

  async listConversationsForTeacher(teacherId: string): Promise<ConversationRow[]> {
    return this.db
      .select(conversationColumns)
      .from(conversations)
      .where(eq(conversations.teacherId, teacherId))
      .orderBy(recencyOrder);
  }

  async listAllConversations(): Promise<ConversationRow[]> {
    return this.db.select(conversationColumns).from(conversations).orderBy(recencyOrder);
  }

  async listMessages(conversationId: string): Promise<MessageRow[]> {
    return this.db
      .select(messageColumns)
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async insertMessage(conversationId: string, senderId: string, body: string): Promise<MessageRow> {
    const [row] = await this.db
      .insert(messages)
      .values({ conversationId, senderId, body })
      .returning(messageColumns);
    // Keep the inbox recency in sync with the message just written.
    await this.db
      .update(conversations)
      .set({ lastMessageAt: row.createdAt })
      .where(eq(conversations.id, conversationId));
    return row;
  }

  async markRead(conversationId: string, readerId: string): Promise<void> {
    // Mark everything the reader received (i.e. did not send) as read.
    await this.db
      .update(messages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, readerId),
          isNull(messages.readAt),
        ),
      );
  }

  async getUsersBrief(ids: string[]): Promise<UserBrief[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: users.id, metadata: users.metadata })
      .from(users)
      .where(inArray(users.id, ids));
    return rows.map((r) => ({
      id: r.id,
      fullName: (r.metadata as { fullName?: string } | null)?.fullName ?? null,
    }));
  }

  async getLastMessages(conversationIds: string[]): Promise<Map<string, MessageRow>> {
    const result = new Map<string, MessageRow>();
    if (conversationIds.length === 0) return result;
    // Newest-first; keep the first row seen per conversation. Fine for MVP inbox
    // sizes — revisit with DISTINCT ON if thread volume grows.
    const rows = await this.db
      .select(messageColumns)
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .orderBy(desc(messages.createdAt));
    for (const row of rows) {
      if (!result.has(row.conversationId)) result.set(row.conversationId, row);
    }
    return result;
  }

  async listParentContactPairs(
    parentId: string,
  ): Promise<Array<{ teacherId: string; studentId: string }>> {
    return this.db
      .selectDistinct({
        teacherId: learningPrograms.teacherId,
        studentId: enrollments.studentId,
      })
      .from(parentChildren)
      .innerJoin(enrollments, eq(enrollments.studentId, parentChildren.studentId))
      .innerJoin(learningPrograms, eq(enrollments.programId, learningPrograms.id))
      .where(and(eq(parentChildren.parentId, parentId), isNotNull(parentChildren.approvedAt)));
  }

  async getUnreadCounts(
    conversationIds: string[],
    readerId: string,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (conversationIds.length === 0) return result;
    const rows = await this.db
      .select({
        conversationId: messages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(
        and(
          inArray(messages.conversationId, conversationIds),
          ne(messages.senderId, readerId),
          isNull(messages.readAt),
        ),
      )
      .groupBy(messages.conversationId);
    for (const row of rows) result.set(row.conversationId, row.count);
    return result;
  }
}
