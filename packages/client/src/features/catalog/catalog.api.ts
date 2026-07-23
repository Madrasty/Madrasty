import type { ProgramContentView, ProgramSummary } from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Public catalog browsing (server learning-programs browse routes are optionalAuth).
// `locale` is forwarded so the server resolves title/description from the
// translations table for the viewer's UI language (doc 07 §3, doc 12 §6); it
// falls back to the server DEFAULT_LOCALE when omitted.
// getProgram is sent with auth when a token is present so an enrolled student —
// or the owning teacher/admin — sees unlocked lesson details.
export const catalogApi = {
  listPublished(params?: { gradeLevel?: string; subjectId?: string; locale?: string }) {
    const query = new URLSearchParams();
    if (params?.gradeLevel) query.set('gradeLevel', params.gradeLevel);
    if (params?.subjectId) query.set('subjectId', params.subjectId);
    if (params?.locale) query.set('locale', params.locale);
    const qs = query.toString();
    return apiRequest<{ programs: ProgramSummary[] }>(`/learning-programs${qs ? `?${qs}` : ''}`);
  },
  getProgram(programId: string, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<ProgramContentView>(`/learning-programs/${programId}${qs}`, { auth: true });
  },
};
