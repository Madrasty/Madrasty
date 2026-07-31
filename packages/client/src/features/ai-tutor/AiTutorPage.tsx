import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type {
  AiConversationSummary,
  AiConversationView,
  AiUsageView,
  EnrolledProgramView,
} from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { ApiError } from '../../lib/api';
import { enrollmentApi } from '../enrollment/enrollment.api';
import { aiApi } from './ai.api';

// AI Q&A tutor (doc 01 §3, doc 09 phase 3). Two panes, like messaging: threads on
// the left, the conversation on the right. A thread can be scoped to one of the
// student's enrolled programs, which is what the server hands the model as
// curriculum context — an unscoped thread is general study help.
//
// `?program=<id>` pre-selects a program, so a "Ask about this program" link from
// elsewhere in the app lands here ready to type.
export function AiTutorPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [conversations, setConversations] = useState<AiConversationSummary[] | null>(null);
  const [usage, setUsage] = useState<AiUsageView | null>(null);
  const [programs, setPrograms] = useState<EnrolledProgramView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<AiConversationView | null>(null);
  const [listError, setListError] = useState(false);

  const locale = i18n.language;

  const loadConversations = useCallback(async () => {
    setListError(false);
    try {
      const res = await aiApi.listConversations(locale);
      setConversations(res.conversations);
      setUsage(res.usage);
    } catch {
      setListError(true);
    }
  }, [locale]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // The scope picker only ever offers programs the student is actually enrolled
  // in — the server rejects anything else anyway.
  useEffect(() => {
    enrollmentApi
      .listMyPrograms(locale)
      .then((res) => setPrograms(res.programs))
      .catch(() => setPrograms([]));
  }, [locale]);

  const openConversation = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setThread(null);
      try {
        setThread(await aiApi.getConversation(id, locale));
      } catch {
        setSelectedId(null);
      }
    },
    [locale],
  );

  const startConversation = useCallback(
    async (programId: string | null) => {
      const created = await aiApi.startConversation({ programId }, locale);
      setConversations((prev) => [{ ...created }, ...(prev ?? [])]);
      setSelectedId(created.id);
      setThread(created);
    },
    [locale],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await aiApi.deleteConversation(id);
      setConversations((prev) => (prev ?? []).filter((c) => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setThread(null);
      }
    },
    [selectedId],
  );

  // Deep link: ?program=<id> opens a fresh thread scoped to that program once.
  const presetProgram = searchParams.get('program');
  useEffect(() => {
    if (!presetProgram) return;
    setSearchParams({}, { replace: true });
    void startConversation(presetProgram);
  }, [presetProgram, setSearchParams, startConversation]);

  return (
    <div className="flex flex-col gap-unit-lg">
      <div className="flex flex-wrap items-end justify-between gap-unit-md">
        <div>
          <h1 className="text-headline-lg font-semibold">{t('aiTutor.title')}</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">{t('aiTutor.subtitle')}</p>
        </div>
        {usage && <UsageChip usage={usage} />}
      </div>

      <div className="grid min-h-[28rem] grid-cols-1 gap-unit-md md:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-unit-sm">
          <NewConversationControl programs={programs} onStart={startConversation} />
          <ConversationList
            conversations={conversations}
            error={listError}
            selectedId={selectedId}
            onSelect={openConversation}
            onDelete={deleteConversation}
          />
        </div>

        <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
          {selectedId && thread ? (
            <ThreadView
              key={selectedId}
              thread={thread}
              locale={locale}
              onAnswered={(question, answer, nextUsage) => {
                setThread((prev) =>
                  prev ? { ...prev, messages: [...prev.messages, question, answer] } : prev,
                );
                setUsage(nextUsage);
                void loadConversations();
              }}
            />
          ) : selectedId ? (
            <CenteredSpinner />
          ) : (
            <EmptyPane icon="smart_toy" text={t('aiTutor.selectPrompt')} />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Quota + new-thread controls ---

function UsageChip({ usage }: { usage: AiUsageView }) {
  const { t } = useTranslation();
  const spent = usage.remaining === 0;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-unit-md py-1.5 text-label-md font-semibold ${
        spent ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface-variant'
      }`}
    >
      <Icon name="bolt" className="text-[1.1rem]" />
      {t('aiTutor.quota', { remaining: usage.remaining, limit: usage.limit })}
    </span>
  );
}

function NewConversationControl({
  programs,
  onStart,
}: {
  programs: EnrolledProgramView[];
  onStart: (programId: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [programId, setProgramId] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await onStart(programId === '' ? null : programId);
      setProgramId('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-unit-md">
      <label className="text-label-md font-medium text-on-surface-variant" htmlFor="ai-scope">
        {t('aiTutor.scopeLabel')}
      </label>
      <select
        id="ai-scope"
        value={programId}
        onChange={(e) => setProgramId(e.target.value)}
        className="field w-full"
      >
        <option value="">{t('aiTutor.scopeNone')}</option>
        {programs.map((program) => (
          <option key={program.id} value={program.id}>
            {program.title ?? t('aiTutor.untitledProgram')}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-unit-md py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <Icon name="add" className="text-[1.1rem]" />
        {t('aiTutor.newConversation')}
      </button>
    </div>
  );
}

// --- Thread list (left pane) ---

function ConversationList({
  conversations,
  error,
  selectedId,
  onSelect,
  onDelete,
}: {
  conversations: AiConversationSummary[] | null;
  error: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-error/40 bg-error/5 p-unit-lg text-center">
        <Icon name="error" className="text-[2rem] text-error" />
        <p className="mt-2 text-body-md font-semibold">{t('aiTutor.loadError')}</p>
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
        <Icon name="smart_toy" className="text-[2rem] text-on-surface-variant" />
        <p className="text-body-md font-semibold">{t('aiTutor.empty')}</p>
        <p className="text-body-sm text-on-surface-variant">{t('aiTutor.emptyHint')}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {conversations.map((c) => {
        const active = c.id === selectedId;
        return (
          <li key={c.id}>
            <div
              className={`flex items-start gap-2 rounded-xl border p-unit-md transition-colors ${
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className="flex min-w-0 flex-1 flex-col gap-1 text-start"
              >
                <span className="truncate text-body-md font-semibold text-on-surface">
                  {c.title ?? t('aiTutor.untitledConversation')}
                </span>
                <span className="truncate text-label-md text-on-surface-variant">
                  {c.lessonTitle ?? c.programTitle ?? t('aiTutor.scopeNone')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void onDelete(c.id)}
                aria-label={t('aiTutor.delete')}
                className="shrink-0 rounded-full p-1 text-on-surface-variant transition-colors hover:text-error"
              >
                <Icon name="delete" className="text-[1.1rem]" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// --- Transcript + composer (right pane) ---

function ThreadView({
  thread,
  locale,
  onAnswered,
}: {
  thread: AiConversationView;
  locale: string;
  onAnswered: (
    question: AiConversationView['messages'][number],
    answer: AiConversationView['messages'][number],
    usage: AiUsageView,
  ) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.messages.length, asking]);

  const ask = async () => {
    const question = draft.trim();
    if (question === '') return;
    setAsking(true);
    setError(null);
    try {
      const res = await aiApi.ask(thread.id, { question }, locale);
      setDraft('');
      onAnswered(res.question, res.answer, res.usage);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'ask_error';
      setError(
        code === 'ai_daily_limit_reached'
          ? t('aiTutor.limitReached')
          : code === 'ai_unavailable'
            ? t('aiTutor.unavailable')
            : code === 'ai_busy'
              ? t('aiTutor.busy')
              : code === 'not_enrolled'
                ? t('aiTutor.notEnrolled')
                : code === 'guardian_approval_required'
                  ? t('aiTutor.guardianRequired')
                  : code === 'rate_limited'
                    ? t('aiTutor.tooFast')
                    : t('aiTutor.askError'),
      );
    } finally {
      setAsking(false);
    }
  };

  const scope = thread.lessonTitle ?? thread.programTitle;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-outline-variant/60 px-unit-md py-unit-sm">
        <Icon name="smart_toy" className="text-primary" />
        <div className="min-w-0">
          <p className="truncate text-body-md font-semibold">
            {thread.title ?? t('aiTutor.untitledConversation')}
          </p>
          <p className="truncate text-label-sm text-on-surface-variant">
            {scope ?? t('aiTutor.scopeNone')}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-unit-sm overflow-y-auto p-unit-md">
        {thread.messages.length === 0 && (
          <p className="my-auto text-center text-body-md text-on-surface-variant">
            {t('aiTutor.askPrompt')}
          </p>
        )}
        {thread.messages.map((message) => {
          const mine = message.role === 'user';
          return (
            <div
              key={message.id}
              className={`flex max-w-[85%] flex-col gap-1 rounded-xl p-unit-sm ${
                mine
                  ? 'self-end bg-primary text-on-primary'
                  : 'self-start border border-outline-variant bg-surface'
              }`}
            >
              <p className="whitespace-pre-wrap text-body-md">{message.content}</p>
              <span
                className={`text-label-sm ${mine ? 'text-on-primary/70' : 'text-on-surface-variant'}`}
              >
                {dateFmt.format(new Date(message.createdAt))}
              </span>
            </div>
          );
        })}
        {asking && (
          <div className="flex items-center gap-2 self-start rounded-xl border border-outline-variant bg-surface p-unit-sm text-on-surface-variant">
            <Icon name="progress_activity" className="animate-spin text-[1.1rem]" />
            <span className="text-body-sm">{t('aiTutor.thinking')}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-col gap-2 border-t border-outline-variant/60 p-unit-md">
        {error && <p className="text-body-sm font-semibold text-error">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            disabled={asking}
            placeholder={t('aiTutor.placeholder')}
            aria-label={t('aiTutor.placeholder')}
            className="field flex-1 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={ask}
            disabled={asking || draft.trim() === ''}
            aria-label={t('aiTutor.send')}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-unit-md py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="send" className="rtl:-scale-x-100" />
          </button>
        </div>
        <p className="text-label-sm text-on-surface-variant">{t('aiTutor.disclaimer')}</p>
      </div>
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex justify-center p-unit-xl text-on-surface-variant">
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
