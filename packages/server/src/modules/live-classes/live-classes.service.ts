import { createHash } from 'node:crypto';
import type {
  AttendanceRecordView,
  AttendanceStatus,
  JoinLiveClassResponse,
  ListLiveClassesResponse,
  LiveClassRosterResponse,
  LiveClassStatus,
  LiveClassView,
  SetAttendanceRequest,
  UserRole,
} from '@madrasty/shared';
import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import { LESSON_ENTITY, PROGRAM_ENTITY, resolveField } from '../learning-programs/localized';
import { RtcProviderNotConfiguredError, type RtcProvider } from './rtc.provider';
import type {
  AttendanceRow,
  LiveClassesRepository,
  LiveLessonRow,
  TranslationRow,
  UserBrief,
} from './live-classes.repository';

export interface Actor {
  id: string;
  role: UserRole;
}

function isAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'center_admin';
}

// What the join/leave events recorded, kept in attendance_records.metadata so the
// single `status` column doesn't have to carry the audit trail (doc 10 §3.4).
interface AttendanceMeta {
  firstJoinedAt?: string;
  lastLeftAt?: string;
  joins?: number;
  minutesPresent?: number;
  autoStatus?: AttendanceStatus;
  overriddenBy?: string;
}

// Live classes (doc 01 §5, doc 10 §3.4, doc 12 §6). Policy:
// - A live LESSON is the session. Its schedule and runtime state live on the
//   live-lesson detail row, so there is no separate session entity to keep in
//   sync with the curriculum tree.
// - Only the owning teacher may start/end a class or override attendance; only
//   the teacher publishes video (`host`), students subscribe (`audience`). Role
//   is decided here and baked into the token — a client asking to be host is
//   ignored.
// - A student may join only while the class is actually LIVE, and only with the
//   doc 01 §7 / doc 11 gate satisfied (active + approved guardian) AND an active
//   enrollment, re-checked at join time.
// - Attendance is written from real join events, never typed in: present, or
//   `late` past the grace period. Ending the class marks every enrolled student
//   who never joined as absent, which is what makes the report card's attendance
//   rate meaningful.
export class LiveClassesService {
  constructor(
    private readonly repo: LiveClassesRepository,
    private readonly rtc: RtcProvider,
  ) {}

  private get defaultLocale(): string {
    return config.DEFAULT_LOCALE;
  }

  // --- reads ---

  async listMine(actor: Actor, locale: string): Promise<ListLiveClassesResponse> {
    const rows =
      actor.role === 'teacher'
        ? await this.repo.listForTeacher(actor.id)
        : actor.role === 'student'
          ? await this.repo.listForStudent(actor.id)
          : [];

    if (rows.length === 0) return { classes: [] };

    const titles = await this.loadTitles(rows, locale);
    const classes = await Promise.all(
      rows.map((row) => this.toView(actor, row, titles, { withCounts: actor.role === 'teacher' })),
    );
    return { classes };
  }

  async getLiveClass(actor: Actor, lessonId: string, locale: string): Promise<LiveClassView> {
    const row = await this.requireLiveLesson(lessonId);
    const owner = this.isOwner(actor, row);
    if (!owner && actor.role === 'student') {
      // Not a hard failure: the view itself explains why they can't join.
      await this.assertEnrolled(actor.id, row.programId);
    }
    const titles = await this.loadTitles([row], locale);
    return this.toView(actor, row, titles, { withCounts: owner });
  }

  async getRoster(
    actor: Actor,
    lessonId: string,
    locale: string,
  ): Promise<LiveClassRosterResponse> {
    const row = await this.requireLiveLesson(lessonId);
    this.assertOwnerOrAdmin(actor, row);

    const [records, roster, titles] = await Promise.all([
      this.repo.listAttendance(lessonId),
      this.repo.listEnrolledStudents(row.programId),
      this.loadTitles([row], locale),
    ]);
    const byStudent = new Map(records.map((r) => [r.studentId, r]));

    return {
      liveClass: await this.toView(actor, row, titles, { withCounts: true }),
      rows: roster.map((student: UserBrief) => ({
        student,
        attendance: toAttendanceView(byStudent.get(student.id) ?? null),
      })),
    };
  }

  // --- session lifecycle (teacher) ---

  async start(actor: Actor, lessonId: string, locale: string): Promise<LiveClassView> {
    const row = await this.requireLiveLesson(lessonId);
    this.assertOwner(actor, row);
    if (row.endedAt) {
      throw HttpError.conflict('class_ended', 'This class has already ended.');
    }

    // Idempotent: a teacher who refreshes mid-class must land back in the same
    // room, not spawn a second one.
    if (row.startedAt && row.channelName) {
      return this.toView(actor, row, await this.loadTitles([row], locale), { withCounts: true });
    }

    const channelName = row.channelName ?? this.rtc.channelFor(lessonId);
    const startedAt = row.startedAt ?? new Date();
    await this.repo.updateRuntime(lessonId, { channelName, startedAt, endedAt: null });

    const started = { ...row, channelName, startedAt, endedAt: null };
    return this.toView(actor, started, await this.loadTitles([row], locale), { withCounts: true });
  }

  async end(actor: Actor, lessonId: string, locale: string): Promise<LiveClassRosterResponse> {
    const row = await this.requireLiveLesson(lessonId);
    this.assertOwner(actor, row);
    if (!row.startedAt) {
      throw HttpError.conflict('class_not_started', 'This class has not started yet.');
    }

    const endedAt = row.endedAt ?? new Date();
    if (!row.endedAt) {
      await this.repo.updateRuntime(lessonId, { endedAt });

      // Everyone who was enrolled and never joined is absent. Without this the
      // report card would only ever see the students who showed up, and an
      // attendance "rate" computed from those is always 100%.
      const [records, roster] = await Promise.all([
        this.repo.listAttendance(lessonId),
        this.repo.listEnrolledStudents(row.programId),
      ]);
      const seen = new Set(records.map((r) => r.studentId));
      for (const student of roster) {
        if (seen.has(student.id)) continue;
        await this.repo.upsertAttendance({
          sessionId: lessonId,
          studentId: student.id,
          status: 'absent',
          metadata: { autoStatus: 'absent' } satisfies AttendanceMeta,
        });
      }
      await this.repo.markAttendanceTaken(lessonId);
    }

    return this.getRoster(actor, lessonId, locale);
  }

  // --- joining ---

  async join(actor: Actor, lessonId: string, locale: string): Promise<JoinLiveClassResponse> {
    const row = await this.requireLiveLesson(lessonId);
    const owner = this.isOwner(actor, row);

    if (!owner) {
      if (actor.role !== 'student') {
        throw HttpError.forbidden('cannot_join', 'Only the teacher and enrolled students can join.');
      }
      await this.assertStudentGate(actor.id);
      await this.assertEnrolled(actor.id, row.programId);
    }

    const status = liveStatus(row);
    if (status === 'ended') throw HttpError.conflict('class_ended', 'This class has ended.');
    if (status === 'scheduled') {
      // The teacher starts the class; a student joining an unstarted room would
      // sit alone in it and, worse, be recorded present for a class that never ran.
      if (!owner) {
        throw HttpError.conflict('class_not_started', 'This class has not started yet.');
      }
      throw HttpError.conflict('class_not_started', 'Start the class before joining.');
    }

    const channel = row.channelName ?? this.rtc.channelFor(lessonId);
    let credentials;
    try {
      credentials = this.rtc.mintToken({
        channel,
        uid: uidFor(actor.id),
        role: owner ? 'host' : 'audience',
        ttlSeconds: config.RTC_TOKEN_TTL_SECONDS,
      });
    } catch (error) {
      if (error instanceof RtcProviderNotConfiguredError) {
        throw new HttpError(503, 'live_unavailable', 'Live classes are not available right now.');
      }
      throw error;
    }

    // The teacher is not marked present in their own class — attendance is about
    // students, and a teacher row would skew every rate on the report card.
    const attendance = owner ? null : await this.recordJoin(actor.id, row);

    const titles = await this.loadTitles([row], locale);
    return {
      liveClass: await this.toView(actor, row, titles, { withCounts: owner }),
      credentials: { ...credentials },
      role: owner ? 'host' : 'audience',
      attendance: toAttendanceView(attendance),
    };
  }

  async leave(actor: Actor, lessonId: string): Promise<AttendanceRecordView | null> {
    const row = await this.requireLiveLesson(lessonId);
    if (this.isOwner(actor, row) || actor.role !== 'student') return null;

    const existing = await this.repo.getAttendance(lessonId, actor.id);
    if (!existing) return null;

    const meta = metaOf(existing);
    const leftAt = new Date();
    // Accumulate across rejoins rather than overwriting: a student who drops and
    // comes back was present for the sum of both stretches.
    const sinceJoin = meta.firstJoinedAt
      ? Math.max(
          0,
          Math.round((leftAt.getTime() - new Date(meta.firstJoinedAt).getTime()) / 60000),
        )
      : 0;
    const updated = await this.repo.upsertAttendance({
      sessionId: lessonId,
      studentId: actor.id,
      status: existing.status,
      recordedBy: existing.recordedBy,
      metadata: {
        ...meta,
        lastLeftAt: leftAt.toISOString(),
        minutesPresent: Math.max(meta.minutesPresent ?? 0, sinceJoin),
      } satisfies AttendanceMeta,
    });
    return toAttendanceView(updated);
  }

  // --- teacher override ---

  async setAttendance(
    actor: Actor,
    lessonId: string,
    req: SetAttendanceRequest,
  ): Promise<AttendanceRecordView> {
    const row = await this.requireLiveLesson(lessonId);
    this.assertOwner(actor, row);
    if (!(await this.repo.studentEnrolledIn(req.studentId, row.programId))) {
      throw HttpError.badRequest('student_not_enrolled', 'That student is not in this program.');
    }

    const existing = await this.repo.getAttendance(lessonId, req.studentId);
    const meta = metaOf(existing);
    const updated = await this.repo.upsertAttendance({
      sessionId: lessonId,
      studentId: req.studentId,
      status: req.status,
      recordedBy: actor.id,
      // Keep what the join events said alongside the override, so a dispute can
      // be settled from the record rather than from memory.
      metadata: { ...meta, overriddenBy: actor.id } satisfies AttendanceMeta,
    });
    // The upsert always returns the row it wrote.
    return toAttendanceView(updated) as AttendanceRecordView;
  }

  // --- internals ---

  private async recordJoin(studentId: string, row: LiveLessonRow): Promise<AttendanceRow> {
    const existing = await this.repo.getAttendance(row.lessonId, studentId);
    const meta = metaOf(existing);
    const now = new Date();

    // A teacher's manual override wins over a later automatic join — otherwise
    // rejoining would silently undo the correction they just made.
    const overridden = existing?.recordedBy != null;
    const status: AttendanceStatus = overridden
      ? (existing!.status as AttendanceStatus)
      : this.statusForJoin(row, meta.firstJoinedAt ? new Date(meta.firstJoinedAt) : now);

    return this.repo.upsertAttendance({
      sessionId: row.lessonId,
      studentId,
      status,
      recordedBy: existing?.recordedBy ?? null,
      metadata: {
        ...meta,
        firstJoinedAt: meta.firstJoinedAt ?? now.toISOString(),
        joins: (meta.joins ?? 0) + 1,
        autoStatus: overridden ? meta.autoStatus : status,
      } satisfies AttendanceMeta,
    });
  }

  // Late once the grace period after the scheduled start has passed. Falls back
  // to when the teacher actually started, for a class scheduled loosely or not
  // at all.
  private statusForJoin(row: LiveLessonRow, joinedAt: Date): AttendanceStatus {
    const reference = row.scheduledStart ?? row.startedAt;
    if (!reference) return 'present';
    const cutoff = reference.getTime() + config.LIVE_CLASS_LATE_GRACE_MINUTES * 60_000;
    return joinedAt.getTime() > cutoff ? 'late' : 'present';
  }

  private async requireLiveLesson(lessonId: string): Promise<LiveLessonRow> {
    const row = await this.repo.getLiveLesson(lessonId);
    if (!row) throw HttpError.notFound('live_class_not_found', 'Live class not found.');
    return row;
  }

  private isOwner(actor: Actor, row: LiveLessonRow): boolean {
    return actor.role === 'teacher' && row.teacherId === actor.id;
  }

  private assertOwner(actor: Actor, row: LiveLessonRow): void {
    if (!this.isOwner(actor, row)) {
      throw HttpError.forbidden('not_your_class', 'You do not own this class.');
    }
  }

  private assertOwnerOrAdmin(actor: Actor, row: LiveLessonRow): void {
    if (!this.isOwner(actor, row) && !isAdmin(actor.role)) {
      throw HttpError.forbidden('not_your_class', 'You do not own this class.');
    }
  }

  // doc 01 §7 / doc 11: a minor's access needs an active account AND an approved
  // guardian — never merely a valid token.
  private async assertStudentGate(studentId: string): Promise<void> {
    const gate = await this.repo.getStudentGate(studentId);
    if (!gate.active) {
      throw HttpError.forbidden('student_not_active', 'This student account is not active.');
    }
    if (!gate.guardianApproved) {
      throw HttpError.forbidden(
        'guardian_approval_required',
        'A guardian must approve this account before it can be used.',
      );
    }
  }

  private async assertEnrolled(studentId: string, programId: string): Promise<void> {
    if (!(await this.repo.studentEnrolledIn(studentId, programId))) {
      throw HttpError.forbidden('not_enrolled', 'You are not enrolled in this program.');
    }
  }

  private async loadTitles(rows: LiveLessonRow[], locale: string) {
    const [lessonRows, programRows] = await Promise.all([
      this.repo.listTranslations(LESSON_ENTITY, rows.map((r) => r.lessonId)),
      this.repo.listTranslations(PROGRAM_ENTITY, rows.map((r) => r.programId)),
    ]);
    return { lessonRows, programRows, locale };
  }

  private async toView(
    actor: Actor,
    row: LiveLessonRow,
    titles: { lessonRows: TranslationRow[]; programRows: TranslationRow[]; locale: string },
    opts: { withCounts: boolean },
  ): Promise<LiveClassView> {
    const status = liveStatus(row);
    const joinOpensAt = row.scheduledStart
      ? new Date(
          row.scheduledStart.getTime() - config.LIVE_CLASS_JOIN_WINDOW_MINUTES * 60_000,
        ).toISOString()
      : null;

    const view: LiveClassView = {
      lessonId: row.lessonId,
      programId: row.programId,
      chapterId: row.chapterId,
      title: resolveField(
        titles.lessonRows,
        row.lessonId,
        'title',
        titles.locale,
        this.defaultLocale,
      ),
      programTitle: resolveField(
        titles.programRows,
        row.programId,
        'title',
        titles.locale,
        this.defaultLocale,
      ),
      scheduledStart: row.scheduledStart?.toISOString() ?? null,
      scheduledEnd: row.scheduledEnd?.toISOString() ?? null,
      status,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      recordingUrl: row.recordingUrl,
      canJoin: false,
      joinBlockedReason: null,
      joinOpensAt,
      myAttendance: null,
    };

    if (this.isOwner(actor, row)) {
      view.canJoin = status !== 'ended';
      view.joinBlockedReason = status === 'ended' ? 'ended' : null;
    } else if (actor.role === 'student') {
      view.myAttendance = toAttendanceView(
        await this.repo.getAttendance(row.lessonId, actor.id),
      );
      view.canJoin = status === 'live';
      view.joinBlockedReason =
        status === 'live'
          ? null
          : status === 'ended'
            ? 'ended'
            : joinOpensAt && Date.now() < new Date(joinOpensAt).getTime()
              ? 'too_early'
              : 'not_started';
    }

    if (opts.withCounts) {
      const [records, roster] = await Promise.all([
        this.repo.listAttendance(row.lessonId),
        this.repo.listEnrolledStudents(row.programId),
      ]);
      view.attendanceCounts = {
        present: records.filter((r) => r.status === 'present').length,
        late: records.filter((r) => r.status === 'late').length,
        absent: records.filter((r) => r.status === 'absent').length,
        enrolled: roster.length,
      };
    }

    return view;
  }
}

// scheduled → live → ended, derived from the runtime columns rather than stored:
// one less piece of state that can disagree with reality.
export function liveStatus(row: {
  startedAt: Date | null;
  endedAt: Date | null;
}): LiveClassStatus {
  if (row.endedAt) return 'ended';
  if (row.startedAt) return 'live';
  return 'scheduled';
}

// Agora identifies participants by a 32-bit unsigned int, so our UUIDs need a
// stable numeric projection. Collisions only matter within one channel, and a
// 31-bit space over one classroom makes that vanishingly unlikely.
export function uidFor(userId: string): number {
  const digest = createHash('sha256').update(userId).digest();
  return (digest.readUInt32BE(0) % 2_147_483_646) + 1;
}

function metaOf(row: AttendanceRow | null): AttendanceMeta {
  return ((row?.metadata ?? {}) as AttendanceMeta) ?? {};
}

function toAttendanceView(row: AttendanceRow | null): AttendanceRecordView | null {
  if (!row) return null;
  const meta = metaOf(row);
  return {
    studentId: row.studentId,
    status: row.status as AttendanceStatus,
    recordedAt: row.recordedAt.toISOString(),
    firstJoinedAt: meta.firstJoinedAt ?? null,
    lastLeftAt: meta.lastLeftAt ?? null,
    minutesPresent: meta.minutesPresent ?? null,
    overridden: row.recordedBy !== null,
  };
}
