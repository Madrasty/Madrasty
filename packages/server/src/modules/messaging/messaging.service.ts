import type {
  ConversationView,
  ConversationThreadResponse,
  MessageableContact,
  MessageView,
  StartConversationRequest,
  UserRole,
} from '@madrasty/shared';
import { HttpError } from '../../lib/http-error';
import type {
  ConversationRow,
  MessageRow,
  MessagingRepository,
  UserBrief,
} from './messaging.repository';

export interface Actor {
  id: string;
  role: UserRole;
}

function isAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'center_admin';
}

function toMessageView(row: MessageRow): MessageView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: row.body,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// Parent–teacher messaging policy (doc 10 §3.3, §6):
// - A conversation is a (parent, teacher, student) triple; opening one is a
//   find-or-create keyed on that triple.
// - A parent may only touch conversations about a child they are the APPROVED
//   guardian of; a teacher only about students enrolled in their programs.
// - Admins may READ any conversation (audit) but may never post (§6).
export class MessagingService {
  constructor(private readonly repo: MessagingRepository) {}

  // Parent starts (or re-opens) a thread with a teacher about their child.
  async startConversation(
    actor: Actor,
    req: StartConversationRequest,
  ): Promise<ConversationView> {
    if (actor.role !== 'parent') {
      throw HttpError.forbidden('not_parent', 'Only a parent can start a conversation.');
    }
    if (!(await this.repo.isApprovedParentOf(actor.id, req.studentId))) {
      throw HttpError.forbidden(
        'not_your_child',
        'You are not an approved guardian of this student.',
      );
    }
    if (!(await this.repo.userHasRole(req.teacherId, 'teacher'))) {
      throw HttpError.badRequest('not_a_teacher', 'The selected recipient is not a teacher.');
    }
    if (!(await this.repo.teacherTeachesStudent(req.teacherId, req.studentId))) {
      throw HttpError.forbidden(
        'teacher_not_linked',
        'This teacher does not teach the selected child.',
      );
    }

    let convo = await this.repo.findConversation(actor.id, req.teacherId, req.studentId);
    if (!convo) {
      convo = await this.repo.createConversation(actor.id, req.teacherId, req.studentId);
    }
    const [view] = await this.toViews([convo], actor);
    return view;
  }

  // The (teacher, child) pairs a parent may start a conversation about.
  async listContacts(actor: Actor): Promise<MessageableContact[]> {
    if (actor.role !== 'parent') {
      throw HttpError.forbidden('not_parent', 'Only a parent can list message contacts.');
    }
    const pairs = await this.repo.listParentContactPairs(actor.id);
    if (pairs.length === 0) return [];
    const ids = new Set<string>();
    for (const p of pairs) {
      ids.add(p.teacherId);
      ids.add(p.studentId);
    }
    const briefs = await this.repo.getUsersBrief([...ids]);
    const byId = new Map(briefs.map((b) => [b.id, b]));
    const brief = (id: string) => byId.get(id) ?? { id, fullName: null };
    return pairs.map((p) => ({ teacher: brief(p.teacherId), student: brief(p.studentId) }));
  }

  async listConversations(actor: Actor): Promise<ConversationView[]> {
    let rows: ConversationRow[];
    if (actor.role === 'parent') {
      rows = await this.repo.listConversationsForParent(actor.id);
    } else if (actor.role === 'teacher') {
      rows = await this.repo.listConversationsForTeacher(actor.id);
    } else if (isAdmin(actor.role)) {
      rows = await this.repo.listAllConversations();
    } else {
      throw HttpError.forbidden('no_inbox', 'This role has no messaging inbox.');
    }
    return this.toViews(rows, actor);
  }

  async getThread(actor: Actor, conversationId: string): Promise<ConversationThreadResponse> {
    const convo = await this.requireConversation(conversationId);
    this.assertCanView(actor, convo);
    // Opening a thread marks its incoming messages read — but only for an actual
    // participant; an admin auditing must not alter read state.
    if (this.isParticipant(actor, convo)) {
      await this.repo.markRead(conversationId, actor.id);
    }
    const messages = await this.repo.listMessages(conversationId);
    const [conversation] = await this.toViews([convo], actor);
    return { conversation, messages: messages.map(toMessageView) };
  }

  async sendMessage(actor: Actor, conversationId: string, body: string): Promise<MessageView> {
    const convo = await this.requireConversation(conversationId);
    if (!this.isParticipant(actor, convo)) {
      if (isAdmin(actor.role)) {
        throw HttpError.forbidden(
          'admin_cannot_post',
          'Admins may view conversations but not post to them.',
        );
      }
      throw HttpError.forbidden('not_a_participant', 'You are not part of this conversation.');
    }
    const row = await this.repo.insertMessage(conversationId, actor.id, body);
    // TODO(doc 10 §3.5): notify the recipient (push/WhatsApp/email) once the
    // notifications module + BullMQ are wired. For now the message is in-app only.
    return toMessageView(row);
  }

  async markRead(actor: Actor, conversationId: string): Promise<void> {
    const convo = await this.requireConversation(conversationId);
    if (!this.isParticipant(actor, convo)) {
      throw HttpError.forbidden('not_a_participant', 'You are not part of this conversation.');
    }
    await this.repo.markRead(conversationId, actor.id);
  }

  // --- internals ---

  private async requireConversation(id: string): Promise<ConversationRow> {
    const convo = await this.repo.getConversationById(id);
    if (!convo) throw HttpError.notFound('conversation_not_found', 'Conversation not found.');
    return convo;
  }

  private isParticipant(actor: Actor, convo: ConversationRow): boolean {
    return actor.id === convo.parentId || actor.id === convo.teacherId;
  }

  private assertCanView(actor: Actor, convo: ConversationRow): void {
    if (this.isParticipant(actor, convo)) return;
    if (isAdmin(actor.role)) return; // read-only audit access (doc 10 §6)
    throw HttpError.forbidden('not_a_participant', 'You are not part of this conversation.');
  }

  // Assembles ConversationView[] for a viewer: resolves participant names, the
  // last message preview, and the viewer's own unread count in batch.
  private async toViews(rows: ConversationRow[], actor: Actor): Promise<ConversationView[]> {
    if (rows.length === 0) return [];
    const conversationIds = rows.map((r) => r.id);
    const userIds = new Set<string>();
    for (const r of rows) {
      userIds.add(r.parentId);
      userIds.add(r.teacherId);
      userIds.add(r.studentId);
    }

    const [briefs, lastMessages, unreadCounts] = await Promise.all([
      this.repo.getUsersBrief([...userIds]),
      this.repo.getLastMessages(conversationIds),
      this.repo.getUnreadCounts(conversationIds, actor.id),
    ]);
    const briefById = new Map<string, UserBrief>(briefs.map((b) => [b.id, b]));
    const participant = (id: string): UserBrief => briefById.get(id) ?? { id, fullName: null };

    return rows.map((r) => {
      const last = lastMessages.get(r.id) ?? null;
      // Unread only makes sense for a participant; an admin auditor sees 0.
      const isParticipant = actor.id === r.parentId || actor.id === r.teacherId;
      return {
        id: r.id,
        parent: participant(r.parentId),
        teacher: participant(r.teacherId),
        student: participant(r.studentId),
        status: r.status as ConversationView['status'],
        lastMessage: last ? toMessageView(last) : null,
        unreadCount: isParticipant ? (unreadCounts.get(r.id) ?? 0) : 0,
        createdAt: r.createdAt.toISOString(),
        lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
      };
    });
  }
}
