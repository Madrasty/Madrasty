import type {
  ListPendingProgramsResponse,
  ListPendingTeachersResponse,
  RejectRequest,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Client for the admin governance API (server modules/admin). All calls are
// admin-only; mutating actions are audited server-side (admin_audit_log).
export const adminApi = {
  listPendingTeachers() {
    return apiRequest<ListPendingTeachersResponse>('/admin/teachers?status=pending', { auth: true });
  },
  verifyTeacher(userId: string) {
    return apiRequest<{ ok: boolean }>(`/admin/teachers/${userId}/verify`, {
      method: 'POST',
      auth: true,
    });
  },
  rejectTeacher(userId: string, body: RejectRequest = {}) {
    return apiRequest<{ ok: boolean }>(`/admin/teachers/${userId}/reject`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
  listPendingPrograms(locale?: string) {
    const qs = locale ? `&locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<ListPendingProgramsResponse>(`/admin/programs?status=pending_review${qs}`, {
      auth: true,
    });
  },
  approveProgram(programId: string) {
    return apiRequest<{ ok: boolean }>(`/admin/programs/${programId}/approve`, {
      method: 'POST',
      auth: true,
    });
  },
  rejectProgram(programId: string, body: RejectRequest = {}) {
    return apiRequest<{ ok: boolean }>(`/admin/programs/${programId}/reject`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
};
