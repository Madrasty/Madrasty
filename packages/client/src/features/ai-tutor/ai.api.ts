import type {
  AiConversationView,
  AiUsageView,
  AskAiRequest,
  AskAiResponse,
  ListAiConversationsResponse,
  StartAiConversationRequest,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Client for the AI Q&A tutor (doc 01 §3, doc 09 phase 3). `locale` is forwarded
// so the curriculum context — and the answer — come back in the UI language. All
// endpoints are authenticated; the server scopes everything to the caller and
// re-checks the guardian gate + enrollment on every question.
function qs(locale?: string): string {
  return locale ? `?locale=${encodeURIComponent(locale)}` : '';
}

export const aiApi = {
  listConversations(locale?: string) {
    return apiRequest<ListAiConversationsResponse>(`/ai/conversations${qs(locale)}`, {
      auth: true,
    });
  },
  startConversation(body: StartAiConversationRequest, locale?: string) {
    return apiRequest<AiConversationView>(`/ai/conversations${qs(locale)}`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
  getConversation(conversationId: string, locale?: string) {
    return apiRequest<AiConversationView>(`/ai/conversations/${conversationId}${qs(locale)}`, {
      auth: true,
    });
  },
  deleteConversation(conversationId: string) {
    return apiRequest<void>(`/ai/conversations/${conversationId}`, {
      method: 'DELETE',
      auth: true,
    });
  },
  ask(conversationId: string, body: AskAiRequest, locale?: string) {
    return apiRequest<AskAiResponse>(`/ai/conversations/${conversationId}/messages${qs(locale)}`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
  getUsage() {
    return apiRequest<AiUsageView>('/ai/usage', { auth: true });
  },
};
