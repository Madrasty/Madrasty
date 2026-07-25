import type {
  ConversationThreadResponse,
  ConversationView,
  ListContactsResponse,
  ListConversationsResponse,
  MessageView,
  StartConversationRequest,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Parent–teacher messaging (doc 10 §3.3). All endpoints are authenticated; the
// server scopes results to the caller (parent = own, teacher = inbox, admin =
// read-only audit) and enforces per-record permissions.
export const messagingApi = {
  listConversations() {
    return apiRequest<ListConversationsResponse>('/messaging/conversations', { auth: true });
  },
  // Parent only: (teacher, child) pairs a new conversation can be started about.
  listContacts() {
    return apiRequest<ListContactsResponse>('/messaging/contacts', { auth: true });
  },
  getThread(conversationId: string) {
    return apiRequest<ConversationThreadResponse>(
      `/messaging/conversations/${conversationId}`,
      { auth: true },
    );
  },
  start(body: StartConversationRequest) {
    return apiRequest<ConversationView>('/messaging/conversations', {
      method: 'POST',
      body,
      auth: true,
    });
  },
  send(conversationId: string, body: string) {
    return apiRequest<MessageView>(`/messaging/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body },
      auth: true,
    });
  },
  markRead(conversationId: string) {
    return apiRequest<void>(`/messaging/conversations/${conversationId}/read`, {
      method: 'POST',
      auth: true,
    });
  },
};
