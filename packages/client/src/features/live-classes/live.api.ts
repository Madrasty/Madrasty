import type {
  AttendanceRecordView,
  JoinLiveClassResponse,
  ListLiveClassesResponse,
  LiveClassRosterResponse,
  LiveClassView,
  SetAttendanceRequest,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Client for live classes (doc 01 §5, doc 10 §3.4). `locale` is forwarded so
// lesson/program titles resolve for the UI language.
//
// Note what this client never sends: a channel name, an RTC role, or an
// attendance status for itself. The server decides all three — join credentials
// are minted per caller, and a student cannot ask to be the host.
function qs(locale?: string): string {
  return locale ? `?locale=${encodeURIComponent(locale)}` : '';
}

export const liveApi = {
  listMine(locale?: string) {
    return apiRequest<ListLiveClassesResponse>(`/live-classes${qs(locale)}`, { auth: true });
  },
  getLiveClass(lessonId: string, locale?: string) {
    return apiRequest<LiveClassView>(`/live-classes/${lessonId}${qs(locale)}`, { auth: true });
  },
  start(lessonId: string, locale?: string) {
    return apiRequest<LiveClassView>(`/live-classes/${lessonId}/start${qs(locale)}`, {
      method: 'POST',
      auth: true,
    });
  },
  end(lessonId: string, locale?: string) {
    return apiRequest<LiveClassRosterResponse>(`/live-classes/${lessonId}/end${qs(locale)}`, {
      method: 'POST',
      auth: true,
    });
  },
  join(lessonId: string, locale?: string) {
    return apiRequest<JoinLiveClassResponse>(`/live-classes/${lessonId}/join${qs(locale)}`, {
      method: 'POST',
      auth: true,
    });
  },
  leave(lessonId: string) {
    return apiRequest<AttendanceRecordView | null>(`/live-classes/${lessonId}/leave`, {
      method: 'POST',
      auth: true,
    });
  },
  getRoster(lessonId: string, locale?: string) {
    return apiRequest<LiveClassRosterResponse>(
      `/live-classes/${lessonId}/attendance${qs(locale)}`,
      { auth: true },
    );
  },
  setAttendance(lessonId: string, body: SetAttendanceRequest) {
    return apiRequest<AttendanceRecordView>(`/live-classes/${lessonId}/attendance`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
};
