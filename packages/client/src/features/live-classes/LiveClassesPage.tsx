import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AttendanceStatus,
  JoinLiveClassResponse,
  LiveClassRosterResponse,
  LiveClassView,
} from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { ApiError } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { liveApi } from './live.api';
import { LiveRoom } from './LiveRoom';

// Live classes (doc 01 §5, doc 10 §3.4, doc 12 §6). One role-aware screen: a
// teacher sees their own classes with start/end and the register, a student sees
// the classes of the programs they're enrolled in and can join while one is
// running. Attendance is never typed in here — it comes from the join events.
export function LiveClassesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const locale = i18n.language;

  const [classes, setClasses] = useState<LiveClassView[] | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<JoinLiveClassResponse | null>(null);
  const [roster, setRoster] = useState<LiveClassRosterResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await liveApi.listMine(locale);
      setClasses(res.classes);
    } catch {
      setError(true);
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => classes?.find((c) => c.lessonId === selectedId) ?? null,
    [classes, selectedId],
  );

  // Leaving is best-effort: the server closes the attendance row, but a closed
  // tab can't call it, which is why `present` is written on JOIN rather than on
  // a clean leave.
  const leaveRoom = useCallback(async () => {
    if (!session) return;
    const lessonId = session.liveClass.lessonId;
    setSession(null);
    try {
      await liveApi.leave(lessonId);
    } catch {
      /* the join already recorded attendance */
    }
    void load();
  }, [session, load]);

  const select = (lessonId: string) => {
    if (session) void leaveRoom();
    setSelectedId(lessonId);
    setRoster(null);
    setActionError(null);
  };

  const describeError = (e: unknown): string => {
    const code = e instanceof ApiError ? e.code : 'error';
    switch (code) {
      case 'class_not_started':
        return t('live.errors.notStarted');
      case 'class_ended':
        return t('live.errors.ended');
      case 'not_enrolled':
        return t('live.errors.notEnrolled');
      case 'guardian_approval_required':
        return t('live.errors.guardianRequired');
      case 'live_unavailable':
        return t('live.errors.unavailable');
      case 'rate_limited':
        return t('live.errors.tooFast');
      default:
        return t('live.errors.generic');
    }
  };

  const start = async (lessonId: string) => {
    setActionError(null);
    try {
      await liveApi.start(lessonId, locale);
      await load();
    } catch (e) {
      setActionError(describeError(e));
    }
  };

  const end = async (lessonId: string) => {
    setActionError(null);
    try {
      if (session) await leaveRoom();
      const result = await liveApi.end(lessonId, locale);
      setRoster(result);
      await load();
    } catch (e) {
      setActionError(describeError(e));
    }
  };

  const join = async (lessonId: string) => {
    setActionError(null);
    try {
      setSession(await liveApi.join(lessonId, locale));
      await load();
    } catch (e) {
      setActionError(describeError(e));
    }
  };

  const showRoster = async (lessonId: string) => {
    setActionError(null);
    try {
      setRoster(await liveApi.getRoster(lessonId, locale));
    } catch (e) {
      setActionError(describeError(e));
    }
  };

  const overrideAttendance = async (
    lessonId: string,
    studentId: string,
    status: AttendanceStatus,
  ) => {
    try {
      await liveApi.setAttendance(lessonId, { studentId, status });
      await showRoster(lessonId);
    } catch (e) {
      setActionError(describeError(e));
    }
  };

  return (
    <div className="flex flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('live.title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {isTeacher ? t('live.teacherSubtitle') : t('live.studentSubtitle')}
        </p>
      </div>

      <div className="grid min-h-[28rem] grid-cols-1 gap-unit-md md:grid-cols-[20rem_1fr]">
        <ClassList
          classes={classes}
          error={error}
          selectedId={selectedId}
          isTeacher={isTeacher}
          onSelect={select}
        />

        <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-unit-md">
          {!selected ? (
            <EmptyPane icon="videocam" text={t('live.selectPrompt')} />
          ) : (
            <div className="flex flex-col gap-unit-md">
              <ClassHeader liveClass={selected} isTeacher={isTeacher} />

              {actionError && (
                <p className="text-body-sm font-semibold text-error">{actionError}</p>
              )}

              {session?.liveClass.lessonId === selected.lessonId ? (
                <LiveRoom
                  credentials={session.credentials}
                  role={session.role}
                  onError={(message) => setActionError(message)}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {isTeacher ? (
                  <>
                    {selected.status === 'scheduled' && (
                      <PrimaryButton icon="play_circle" onClick={() => start(selected.lessonId)}>
                        {t('live.startClass')}
                      </PrimaryButton>
                    )}
                    {selected.status === 'live' && !session && (
                      <PrimaryButton icon="videocam" onClick={() => join(selected.lessonId)}>
                        {t('live.enterRoom')}
                      </PrimaryButton>
                    )}
                    {selected.status === 'live' && (
                      <SecondaryButton icon="stop_circle" onClick={() => end(selected.lessonId)}>
                        {t('live.endClass')}
                      </SecondaryButton>
                    )}
                    <SecondaryButton
                      icon="fact_check"
                      onClick={() => showRoster(selected.lessonId)}
                    >
                      {t('live.viewRegister')}
                    </SecondaryButton>
                  </>
                ) : session ? (
                  <SecondaryButton icon="logout" onClick={leaveRoom}>
                    {t('live.leave')}
                  </SecondaryButton>
                ) : (
                  <PrimaryButton
                    icon="videocam"
                    disabled={!selected.canJoin}
                    onClick={() => join(selected.lessonId)}
                  >
                    {t('live.join')}
                  </PrimaryButton>
                )}
              </div>

              {!isTeacher && !selected.canJoin && selected.joinBlockedReason && (
                <p className="text-body-sm text-on-surface-variant">
                  {t(`live.blocked.${selected.joinBlockedReason}`)}
                </p>
              )}

              {!isTeacher && selected.myAttendance && (
                <p className="text-body-sm text-on-surface-variant">
                  {t('live.myAttendance', {
                    status: t(`live.status.${selected.myAttendance.status}`),
                  })}
                </p>
              )}

              {roster && roster.liveClass.lessonId === selected.lessonId && (
                <Register
                  roster={roster}
                  onOverride={(studentId, status) =>
                    overrideAttendance(selected.lessonId, studentId, status)
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- list (left pane) ---

function ClassList({
  classes,
  error,
  selectedId,
  isTeacher,
  onSelect,
}: {
  classes: LiveClassView[] | null;
  error: boolean;
  selectedId: string | null;
  isTeacher: boolean;
  onSelect: (lessonId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language],
  );

  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-error/40 bg-error/5 p-unit-lg text-center">
        <Icon name="error" className="text-[2rem] text-error" />
        <p className="mt-2 text-body-md font-semibold">{t('live.loadError')}</p>
      </div>
    );
  }
  if (classes === null) {
    return (
      <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
        <div className="flex justify-center p-unit-xl text-on-surface-variant">
          <Icon name="progress_activity" className="animate-spin text-[2rem]" />
        </div>
      </div>
    );
  }
  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-lg text-center">
        <Icon name="videocam" className="text-[2rem] text-on-surface-variant" />
        <p className="text-body-md font-semibold">{t('live.empty')}</p>
        <p className="text-body-sm text-on-surface-variant">
          {isTeacher ? t('live.emptyHintTeacher') : t('live.emptyHintStudent')}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {classes.map((c) => (
        <li key={c.lessonId}>
          <button
            type="button"
            onClick={() => onSelect(c.lessonId)}
            className={`flex w-full flex-col gap-1 rounded-xl border p-unit-md text-start transition-colors ${
              c.lessonId === selectedId
                ? 'border-primary bg-primary/5'
                : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-body-md font-semibold">
                {c.title ?? t('live.untitled')}
              </span>
              <StatusChip status={c.status} />
            </div>
            <span className="truncate text-label-md text-on-surface-variant">
              {c.programTitle ?? ''}
            </span>
            {c.scheduledStart && (
              <span className="text-label-sm text-on-surface-variant">
                {dateFmt.format(new Date(c.scheduledStart))}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ClassHeader({ liveClass, isTeacher }: { liveClass: LiveClassView; isTeacher: boolean }) {
  const { t, i18n } = useTranslation();
  const counts = liveClass.attendanceCounts;
  return (
    <div className="flex flex-wrap items-start justify-between gap-unit-sm">
      <div>
        <h2 className="text-headline-md font-semibold">
          {liveClass.title ?? t('live.untitled')}
        </h2>
        <p className="text-body-md text-on-surface-variant">{liveClass.programTitle}</p>
        {liveClass.scheduledStart && (
          <p className="text-label-md text-on-surface-variant">
            {new Date(liveClass.scheduledStart).toLocaleString(i18n.language)}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <StatusChip status={liveClass.status} />
        {isTeacher && counts && (
          <span className="text-label-md text-on-surface-variant">
            {t('live.counts', {
              attended: counts.present + counts.late,
              enrolled: counts.enrolled,
            })}
          </span>
        )}
      </div>
    </div>
  );
}

// --- register (teacher) ---

function Register({
  roster,
  onOverride,
}: {
  roster: LiveClassRosterResponse;
  onOverride: (studentId: string, status: AttendanceStatus) => void;
}) {
  const { t } = useTranslation();
  const statuses: AttendanceStatus[] = ['present', 'late', 'absent'];

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant/60">
      <table className="w-full min-w-[32rem] text-start text-body-sm">
        <thead className="bg-surface-container-low text-label-md text-on-surface-variant">
          <tr>
            <th className="p-unit-sm text-start">{t('live.student')}</th>
            <th className="p-unit-sm text-start">{t('live.attendance')}</th>
            <th className="p-unit-sm text-start">{t('live.override')}</th>
          </tr>
        </thead>
        <tbody>
          {roster.rows.map(({ student, attendance }) => (
            <tr key={student.id} className="border-t border-outline-variant/60">
              <td className="p-unit-sm">{student.fullName ?? t('live.unknownStudent')}</td>
              <td className="p-unit-sm">
                {attendance ? (
                  <span className="inline-flex items-center gap-2">
                    {t(`live.status.${attendance.status}`)}
                    {attendance.overridden && (
                      <Icon
                        name="edit"
                        className="text-[0.9rem] text-on-surface-variant"
                        aria-label={t('live.overridden')}
                      />
                    )}
                  </span>
                ) : (
                  <span className="text-on-surface-variant">{t('live.noRecord')}</span>
                )}
              </td>
              <td className="p-unit-sm">
                <div className="flex gap-1">
                  {statuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => onOverride(student.id, status)}
                      className={`rounded-full px-2 py-1 text-label-sm transition-colors ${
                        attendance?.status === status
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {t(`live.status.${status}`)}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- small shared bits ---

function StatusChip({ status }: { status: LiveClassView['status'] }) {
  const { t } = useTranslation();
  const tone =
    status === 'live'
      ? 'bg-error text-on-error'
      : status === 'ended'
        ? 'bg-surface-container text-on-surface-variant'
        : 'bg-secondary-container text-on-secondary-container';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-label-sm font-semibold ${tone}`}
    >
      {status === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {t(`live.classStatus.${status}`)}
    </span>
  );
}

function PrimaryButton({
  icon,
  disabled,
  onClick,
  children,
}: {
  icon: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full bg-primary px-unit-md py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      <Icon name={icon} className="text-[1.1rem]" />
      {children}
    </button>
  );
}

function SecondaryButton({
  icon,
  onClick,
  children,
}: {
  icon: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-outline-variant px-unit-md py-2 text-label-lg font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
    >
      <Icon name={icon} className="text-[1.1rem]" />
      {children}
    </button>
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
