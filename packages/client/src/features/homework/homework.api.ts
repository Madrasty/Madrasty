import type {
  CreateAssignmentRequest,
  GradeHomeworkRequest,
  HomeworkAssignmentView,
  HomeworkByLessonResponse,
  HomeworkQueueResponse,
  HomeworkSubmissionView,
  SubmitHomeworkRequest,
  UpdateAssignmentRequest,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Client for the homework API (doc 12 §6). `locale` is forwarded so the brief
// resolves for the UI language. All endpoints are authenticated; the server
// scopes by owner (teacher) / enrollment (student).
export const homeworkApi = {
  getByLesson(lessonId: string) {
    return apiRequest<HomeworkByLessonResponse>(`/homework/assignments/by-lesson/${lessonId}`, {
      auth: true,
    });
  },
  getAssignment(assignmentId: string, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<HomeworkAssignmentView>(`/homework/assignments/${assignmentId}${qs}`, {
      auth: true,
    });
  },
  createAssignment(body: CreateAssignmentRequest, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<HomeworkAssignmentView>(`/homework/assignments${qs}`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
  updateAssignment(assignmentId: string, body: UpdateAssignmentRequest, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<HomeworkAssignmentView>(`/homework/assignments/${assignmentId}${qs}`, {
      method: 'PATCH',
      body,
      auth: true,
    });
  },
  submit(assignmentId: string, body: SubmitHomeworkRequest, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<HomeworkSubmissionView>(
      `/homework/assignments/${assignmentId}/submissions${qs}`,
      { method: 'POST', body, auth: true },
    );
  },
  listSubmissions(assignmentId: string, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<HomeworkQueueResponse>(
      `/homework/assignments/${assignmentId}/submissions${qs}`,
      { auth: true },
    );
  },
  grade(submissionId: string, body: GradeHomeworkRequest) {
    return apiRequest<HomeworkSubmissionView>(`/homework/submissions/${submissionId}/grade`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
};
