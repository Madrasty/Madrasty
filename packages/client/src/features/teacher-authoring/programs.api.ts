import type {
  AuthoredChapter,
  AuthoredLesson,
  AuthoredProgram,
  CreateChapterRequest,
  CreateLessonRequest,
  CreateProgramRequest,
  ListMyProgramsResponse,
  ProgramContentView,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Client for the learning-programs authoring API (server modules/learning-programs).
// All authoring calls send the Bearer token; the program tree read is sent with
// auth too so the owning teacher sees drafts + full lesson details.
export const programsApi = {
  listMine() {
    return apiRequest<ListMyProgramsResponse>('/learning-programs/mine', { auth: true });
  },
  create(body: CreateProgramRequest) {
    return apiRequest<AuthoredProgram>('/learning-programs', { method: 'POST', body, auth: true });
  },
  getProgram(programId: string) {
    return apiRequest<ProgramContentView>(`/learning-programs/${programId}`, { auth: true });
  },
  // Teacher submits a draft for admin review (draft → pending_review). Publishing
  // to the catalog is now an admin approval action (doc 09).
  submitProgram(programId: string) {
    return apiRequest<AuthoredProgram>(`/learning-programs/${programId}/submit`, {
      method: 'POST',
      auth: true,
    });
  },
  createChapter(programId: string, body: CreateChapterRequest) {
    return apiRequest<AuthoredChapter>(`/learning-programs/${programId}/chapters`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
  createLesson(programId: string, chapterId: string, body: CreateLessonRequest) {
    return apiRequest<AuthoredLesson>(
      `/learning-programs/${programId}/chapters/${chapterId}/lessons`,
      { method: 'POST', body, auth: true },
    );
  },
  publishLesson(programId: string, chapterId: string, lessonId: string) {
    return apiRequest<unknown>(
      `/learning-programs/${programId}/chapters/${chapterId}/lessons/${lessonId}/publish`,
      { method: 'POST', auth: true },
    );
  },
};
