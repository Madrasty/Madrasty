import type {
  ListMyEnrolledProgramsResponse,
  ListParentChildrenResponse,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Student's own enrolled programs + a parent's children — the data behind the
// student and parent dashboards. Both are authenticated and server-scoped to the
// caller.
export const enrollmentApi = {
  // Student: active enrollments (GET /learning-programs/my-programs).
  listMyPrograms(locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<ListMyEnrolledProgramsResponse>(`/learning-programs/my-programs${qs}`, {
      auth: true,
    });
  },
  // Parent: their linked children (GET /auth/parent/students).
  listMyChildren() {
    return apiRequest<ListParentChildrenResponse>('/auth/parent/students', { auth: true });
  },
};
