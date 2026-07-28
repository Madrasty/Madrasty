import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ConversationThreadResponse,
  ConversationView,
  MessageableContact,
} from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { useAuth } from '../auth/AuthProvider';
import { messagingApi } from './messaging.api';

// Parent–teacher messaging (doc 10 §3.3). One role-aware inbox: a parent sees
// their teachers, a teacher sees a unified parent inbox, an admin audits
// read-only (composer hidden). Two-pane on desktop, stacked on mobile.
export function MessagingPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const role = user?.role ?? 'student';
  const isParent = role === 'parent';
  const isReadOnly = role === 'admin' || role === 'center_admin';

  const [conversations, setConversations] = useState<ConversationView[] | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ConversationThreadResponse | null>(null);
  const [composing, setComposing] = useState(false); // parent "new conversation" view

  const loadConversations = useCallback(async () => {
    setError(false);
    try {
      const res = await messagingApi.listConversations();
      setConversations(res.conversations);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Load a thread when one is selected. getThread marks incoming read server-side,
  // so refresh the list afterwards to clear the unread badge.
  const openConversation = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setComposing(false);
      setThread(null);
      try {
        const res = await messagingApi.getThread(id);
        setThread(res);
        void loadConversations();
      } catch {
        setThread(null);
        setError(true);
      }
    },
    [loadConversations],
  );

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      }),
    [i18n.language],
  );

  return (
    <div className="flex flex-col gap-unit-lg">
      <div className="flex flex-wrap items-end justify-between gap-unit-md">
        <div>
          <h1 className="text-headline-lg font-semibold">
            {isParent ? t('messaging.parentTitle') : t('messaging.teacherTitle')}
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">{t('messaging.subtitle')}</p>
        </div>
        {isParent && (
          <button
            type="button"
            onClick={() => {
              setComposing(true);
              setSelectedId(null);
              setThread(null);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-unit-md py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <Icon name="add" className="text-[1.1rem]" />
            {t('messaging.newMessage')}
          </button>
        )}
      </div>

      <div className="grid min-h-[28rem] grid-cols-1 gap-unit-md md:grid-cols-[20rem_1fr]">
        <ConversationList
          conversations={conversations}
          error={error}
          selectedId={selectedId}
          role={role}
          onSelect={openConversation}
          dateFmt={dateFmt}
        />

        <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
          {composing && isParent ? (
            <NewConversationPanel
              onStarted={(convo) => {
                setComposing(false);
                setConversations((prev) => {
                  const others = (prev ?? []).filter((c) => c.id !== convo.id);
                  return [convo, ...others];
                });
                void openConversation(convo.id);
              }}
              onCancel={() => setComposing(false)}
            />
          ) : selectedId && thread ? (
            <ThreadView
              key={selectedId}
              thread={thread}
              meId={user?.id ?? ''}
              role={role}
              readOnly={isReadOnly}
              dateFmt={dateFmt}
              onSent={(message) => {
                setThread((prev) =>
                  prev ? { ...prev, messages: [...prev.messages, message] } : prev,
                );
                void loadConversations();
              }}
            />
          ) : selectedId ? (
            <CenteredSpinner />
          ) : (
            <EmptyPane icon="forum" text={t('messaging.selectPrompt')} />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Conversation list (left pane) ---

function ConversationList({
  conversations,
  error,
  selectedId,
  role,
  onSelect,
  dateFmt,
}: {
  conversations: ConversationView[] | null;
  error: boolean;
  selectedId: string | null;
  role: string;
  onSelect: (id: string) => void;
  dateFmt: Intl.DateTimeFormat;
}) {
  const { t } = useTranslation();

  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-error/40 bg-error/5 p-unit-lg text-center">
        <Icon name="error" className="text-[2rem] text-error" />
        <p className="mt-2 text-body-md font-semibold">{t('messaging.loadError')}</p>
      </div>
    );
  }
  if (conversations === null) {
    return (
      <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
        <CenteredSpinner />
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-lg text-center">
        <Icon name="forum" className="text-[2rem] text-on-surface-variant" />
        <p className="text-body-md font-semibold">{t('messaging.empty')}</p>
        <p className="text-body-sm text-on-surface-variant">
          {role === 'parent' ? t('messaging.emptyHintParent') : t('messaging.emptyHintTeacher')}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {conversations.map((c) => {
        const other = otherParty(c, role);
        const active = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex w-full flex-col gap-1 rounded-xl border p-unit-md text-start transition-colors ${
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-body-md font-semibold text-on-surface">
                  {other || t('messaging.unknownUser')}
                </span>
                {c.unreadCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-label-sm font-semibold text-on-primary">
                    {c.unreadCount}
                  </span>
                )}
              </div>
              <span className="truncate text-label-md text-on-surface-variant">
                {t('messaging.about', { name: c.student.fullName ?? t('messaging.unknownUser') })}
              </span>
              {c.lastMessage && (
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-body-sm text-on-surface-variant">
                    {c.lastMessage.body}
                  </span>
                  <span className="shrink-0 text-label-sm text-on-surface-variant">
                    {dateFmt.format(new Date(c.lastMessage.createdAt))}
                  </span>
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// --- Thread + composer (right pane) ---

function ThreadView({
  thread,
  meId,
  role,
  readOnly,
  dateFmt,
  onSent,
}: {
  thread: ConversationThreadResponse;
  meId: string;
  role: string;
  readOnly: boolean;
  dateFmt: Intl.DateTimeFormat;
  onSent: (message: ConversationThreadResponse['messages'][number]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { conversation, messages } = thread;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const message = await messagingApi.send(conversation.id, body);
      setDraft('');
      onSent(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-outline-variant/60 p-unit-md">
        <p className="text-body-lg font-semibold text-on-surface">
          {otherParty(conversation, role) || t('messaging.unknownUser')}
        </p>
        <p className="text-label-md text-on-surface-variant">
          {t('messaging.about', {
            name: conversation.student.fullName ?? t('messaging.unknownUser'),
          })}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-unit-md">
        {messages.length === 0 && (
          <div className="m-auto text-center text-body-md text-on-surface-variant">
            {t('messaging.threadEmpty')}
          </div>
        )}
        {messages.map((m) => {
          const mine = m.senderId === meId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-unit-md py-2 ${
                  mine
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface'
                }`}
              >
                <p className="whitespace-pre-wrap break-words text-body-md">{m.body}</p>
                <p
                  className={`mt-1 text-label-sm ${
                    mine ? 'text-on-primary/70' : 'text-on-surface-variant'
                  }`}
                >
                  {dateFmt.format(new Date(m.createdAt))}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {readOnly ? (
        <p className="border-t border-outline-variant/60 p-unit-md text-center text-label-md text-on-surface-variant">
          {t('messaging.readOnly')}
        </p>
      ) : (
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-outline-variant/60 p-unit-md">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit(e);
              }
            }}
            rows={1}
            placeholder={t('messaging.composerPlaceholder')}
            className="field max-h-32 min-h-[2.75rem] flex-1 resize-none"
          />
          <button
            type="submit"
            disabled={sending || draft.trim().length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-unit-md text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="send" className="text-[1.1rem] rtl:-scale-x-100" />
            <span className="hidden sm:inline">{sending ? t('messaging.sending') : t('messaging.send')}</span>
          </button>
        </form>
      )}
    </div>
  );
}

// --- New conversation picker (parent only) ---

function NewConversationPanel({
  onStarted,
  onCancel,
}: {
  onStarted: (conversation: ConversationView) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<MessageableContact[] | null>(null);
  const [error, setError] = useState(false);
  const [startingKey, setStartingKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    messagingApi
      .listContacts()
      .then((res) => active && setContacts(res.contacts))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  const start = async (contact: MessageableContact) => {
    const key = `${contact.teacher.id}:${contact.student.id}`;
    setStartingKey(key);
    try {
      const conversation = await messagingApi.start({
        teacherId: contact.teacher.id,
        studentId: contact.student.id,
      });
      onStarted(conversation);
    } catch {
      setError(true);
    } finally {
      setStartingKey(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-outline-variant/60 p-unit-md">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-primary"
        >
          <Icon name="arrow_back" className="text-[1.1rem] rtl:-scale-x-100" />
          {t('messaging.back')}
        </button>
        <p className="text-body-lg font-semibold">{t('messaging.startTitle')}</p>
      </header>

      <div className="flex-1 overflow-y-auto p-unit-md">
        {error && (
          <p className="text-body-md font-semibold text-error">{t('messaging.loadError')}</p>
        )}
        {contacts === null && !error && <CenteredSpinner />}
        {contacts !== null && contacts.length === 0 && (
          <div className="flex flex-col items-center gap-unit-sm py-unit-lg text-center">
            <Icon name="school" className="text-[2rem] text-on-surface-variant" />
            <p className="text-body-md font-semibold">{t('messaging.noContacts')}</p>
            <p className="text-body-sm text-on-surface-variant">{t('messaging.noContactsHint')}</p>
          </div>
        )}
        {contacts && contacts.length > 0 && (
          <ul className="flex flex-col gap-2">
            {contacts.map((contact) => {
              const key = `${contact.teacher.id}:${contact.student.id}`;
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={startingKey !== null}
                    onClick={() => start(contact)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-outline-variant/60 p-unit-md text-start transition-colors hover:bg-surface-container-low disabled:opacity-50"
                  >
                    <span>
                      <span className="block text-body-md font-semibold text-on-surface">
                        {contact.teacher.fullName ?? t('messaging.unknownUser')}
                      </span>
                      <span className="block text-label-md text-on-surface-variant">
                        {t('messaging.about', {
                          name: contact.student.fullName ?? t('messaging.unknownUser'),
                        })}
                      </span>
                    </span>
                    {startingKey === key ? (
                      <Icon name="progress_activity" className="animate-spin text-[1.2rem]" />
                    ) : (
                      <Icon name="chat_bubble" className="text-[1.2rem] text-primary" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Small shared bits ---

// The name to show for a conversation, from the viewer's perspective: a parent
// sees the teacher, a teacher/admin sees the parent.
function otherParty(c: ConversationView, role: string): string | null {
  if (role === 'parent') return c.teacher.fullName;
  return c.parent.fullName;
}

function CenteredSpinner() {
  return (
    <div className="flex justify-center py-unit-xl text-on-surface-variant">
      <Icon name="progress_activity" className="animate-spin text-[2rem]" />
    </div>
  );
}

function EmptyPane({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-unit-sm p-unit-xl text-center text-on-surface-variant">
      <Icon name={icon} className="text-[2.5rem]" />
      <p className="text-body-md">{text}</p>
    </div>
  );
}
