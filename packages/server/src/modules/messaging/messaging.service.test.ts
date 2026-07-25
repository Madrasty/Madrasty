import { beforeEach, describe, expect, it } from 'vitest';
import type { UserRole } from '@madrasty/shared';
import { HttpError } from '../../lib/http-error';
import { MessagingService, type Actor } from './messaging.service';
import type {
  ConversationRow,
  MessageRow,
  MessagingRepository,
  UserBrief,
} from './messaging.repository';

// In-memory fake of the repository so the service's policy is tested in isolation
// (same DI/fake pattern as loyalty.service.test.ts).
class FakeRepo implements MessagingRepository {
  conversations: ConversationRow[] = [];
  messages: MessageRow[] = [];
  approvedLinks = new Set<string>(); // `${parentId}:${studentId}`
  teachesLinks = new Set<string>(); // `${teacherId}:${studentId}`
  roles = new Map<string, UserRole>();
  markReadCalls: Array<{ conversationId: string; readerId: string }> = [];
  private seq = 0;

  seedRole(id: string, role: UserRole) {
    this.roles.set(id, role);
  }
  approve(parentId: string, studentId: string) {
    this.approvedLinks.add(`${parentId}:${studentId}`);
  }
  teach(teacherId: string, studentId: string) {
    this.teachesLinks.add(`${teacherId}:${studentId}`);
  }

  async isApprovedParentOf(parentId: string, studentId: string) {
    return this.approvedLinks.has(`${parentId}:${studentId}`);
  }
  async teacherTeachesStudent(teacherId: string, studentId: string) {
    return this.teachesLinks.has(`${teacherId}:${studentId}`);
  }
  async userHasRole(userId: string, role: UserRole) {
    return this.roles.get(userId) === role;
  }

  async findConversation(parentId: string, teacherId: string, studentId: string) {
    return (
      this.conversations.find(
        (c) => c.parentId === parentId && c.teacherId === teacherId && c.studentId === studentId,
      ) ?? null
    );
  }
  async createConversation(parentId: string, teacherId: string, studentId: string) {
    const existing = await this.findConversation(parentId, teacherId, studentId);
    if (existing) return existing;
    const row: ConversationRow = {
      id: `c${++this.seq}`,
      parentId,
      teacherId,
      studentId,
      status: 'open',
      createdAt: new Date(),
      lastMessageAt: null,
    };
    this.conversations.push(row);
    return row;
  }
  async getConversationById(id: string) {
    return this.conversations.find((c) => c.id === id) ?? null;
  }
  async listConversationsForParent(parentId: string) {
    return this.conversations.filter((c) => c.parentId === parentId);
  }
  async listConversationsForTeacher(teacherId: string) {
    return this.conversations.filter((c) => c.teacherId === teacherId);
  }
  async listAllConversations() {
    return [...this.conversations];
  }
  async listMessages(conversationId: string) {
    return this.messages.filter((m) => m.conversationId === conversationId);
  }
  async insertMessage(conversationId: string, senderId: string, body: string) {
    const row: MessageRow = {
      id: `m${++this.seq}`,
      conversationId,
      senderId,
      body,
      readAt: null,
      createdAt: new Date(),
    };
    this.messages.push(row);
    const convo = this.conversations.find((c) => c.id === conversationId);
    if (convo) convo.lastMessageAt = row.createdAt;
    return row;
  }
  async markRead(conversationId: string, readerId: string) {
    this.markReadCalls.push({ conversationId, readerId });
    for (const m of this.messages) {
      if (m.conversationId === conversationId && m.senderId !== readerId && m.readAt === null) {
        m.readAt = new Date();
      }
    }
  }
  async getUsersBrief(ids: string[]): Promise<UserBrief[]> {
    return ids.map((id) => ({ id, fullName: `name-${id}` }));
  }
  async getLastMessages(conversationIds: string[]) {
    const map = new Map<string, MessageRow>();
    for (const id of conversationIds) {
      const msgs = this.messages.filter((m) => m.conversationId === id);
      if (msgs.length) map.set(id, msgs[msgs.length - 1]);
    }
    return map;
  }
  contactPairs: Array<{ teacherId: string; studentId: string }> = [];
  async listParentContactPairs(_parentId: string) {
    return this.contactPairs;
  }
  async getUnreadCounts(conversationIds: string[], readerId: string) {
    const map = new Map<string, number>();
    for (const id of conversationIds) {
      const n = this.messages.filter(
        (m) => m.conversationId === id && m.senderId !== readerId && m.readAt === null,
      ).length;
      map.set(id, n);
    }
    return map;
  }
}

const PARENT = 'parent-1';
const TEACHER = 'teacher-1';
const STUDENT = 'student-1';

const parentActor: Actor = { id: PARENT, role: 'parent' };
const teacherActor: Actor = { id: TEACHER, role: 'teacher' };
const adminActor: Actor = { id: 'admin-1', role: 'admin' };

function seededRepo(): FakeRepo {
  const repo = new FakeRepo();
  repo.seedRole(TEACHER, 'teacher');
  repo.approve(PARENT, STUDENT);
  repo.teach(TEACHER, STUDENT);
  return repo;
}

async function expectHttp(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({ statusCode: status, code });
  await expect(promise).rejects.toBeInstanceOf(HttpError);
}

describe('MessagingService — startConversation', () => {
  let repo: FakeRepo;
  let svc: MessagingService;
  beforeEach(() => {
    repo = seededRepo();
    svc = new MessagingService(repo);
  });

  it('creates a conversation for an approved parent + linked teacher', async () => {
    const view = await svc.startConversation(parentActor, {
      teacherId: TEACHER,
      studentId: STUDENT,
    });
    expect(view.parent.id).toBe(PARENT);
    expect(view.teacher.id).toBe(TEACHER);
    expect(view.student.id).toBe(STUDENT);
    expect(repo.conversations).toHaveLength(1);
  });

  it('is idempotent — the same triple resolves to one thread (find-or-create)', async () => {
    const a = await svc.startConversation(parentActor, { teacherId: TEACHER, studentId: STUDENT });
    const b = await svc.startConversation(parentActor, { teacherId: TEACHER, studentId: STUDENT });
    expect(a.id).toBe(b.id);
    expect(repo.conversations).toHaveLength(1);
  });

  it('rejects a non-parent actor', async () => {
    await expectHttp(
      svc.startConversation(teacherActor, { teacherId: TEACHER, studentId: STUDENT }),
      403,
      'not_parent',
    );
  });

  it('rejects a parent who is not the approved guardian of the student', async () => {
    await expectHttp(
      svc.startConversation(
        { id: 'other-parent', role: 'parent' },
        { teacherId: TEACHER, studentId: STUDENT },
      ),
      403,
      'not_your_child',
    );
  });

  it('rejects a recipient that is not a teacher', async () => {
    await expectHttp(
      svc.startConversation(parentActor, { teacherId: 'not-teacher', studentId: STUDENT }),
      400,
      'not_a_teacher',
    );
  });

  it('rejects a teacher who does not teach the child', async () => {
    repo.seedRole('teacher-2', 'teacher');
    await expectHttp(
      svc.startConversation(parentActor, { teacherId: 'teacher-2', studentId: STUDENT }),
      403,
      'teacher_not_linked',
    );
  });
});

describe('MessagingService — messaging + permissions', () => {
  let repo: FakeRepo;
  let svc: MessagingService;
  let conversationId: string;
  beforeEach(async () => {
    repo = seededRepo();
    svc = new MessagingService(repo);
    const view = await svc.startConversation(parentActor, { teacherId: TEACHER, studentId: STUDENT });
    conversationId = view.id;
  });

  it('lets a participant (parent) send a message', async () => {
    const msg = await svc.sendMessage(parentActor, conversationId, 'Hello teacher');
    expect(msg.body).toBe('Hello teacher');
    expect(msg.senderId).toBe(PARENT);
  });

  it('forbids an admin from posting (read-only audit)', async () => {
    await expectHttp(
      svc.sendMessage(adminActor, conversationId, 'as admin'),
      403,
      'admin_cannot_post',
    );
  });

  it('forbids a non-participant parent from posting', async () => {
    await expectHttp(
      svc.sendMessage({ id: 'other-parent', role: 'parent' }, conversationId, 'sneaky'),
      403,
      'not_a_participant',
    );
  });

  it('marks incoming messages read when a participant opens the thread', async () => {
    await svc.sendMessage(parentActor, conversationId, 'from parent');
    const thread = await svc.getThread(teacherActor, conversationId);
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].readAt).not.toBeNull();
    expect(repo.markReadCalls).toContainEqual({ conversationId, readerId: TEACHER });
  });

  it('does NOT mark read when an admin audits the thread', async () => {
    await svc.sendMessage(parentActor, conversationId, 'from parent');
    const thread = await svc.getThread(adminActor, conversationId);
    expect(thread.messages).toHaveLength(1);
    expect(repo.markReadCalls).toHaveLength(0);
  });

  it('surfaces the viewer-relative unread count (teacher sees parent message)', async () => {
    await svc.sendMessage(parentActor, conversationId, 'unread for teacher');
    const [convo] = await svc.listConversations(teacherActor);
    expect(convo.unreadCount).toBe(1);
    expect(convo.lastMessage?.body).toBe('unread for teacher');
  });

  it('reports 0 unread for an admin auditor', async () => {
    await svc.sendMessage(parentActor, conversationId, 'msg');
    const list = await svc.listConversations(adminActor);
    expect(list[0].unreadCount).toBe(0);
  });

  it('404s an unknown conversation', async () => {
    await expectHttp(svc.getThread(parentActor, 'nope'), 404, 'conversation_not_found');
  });
});
