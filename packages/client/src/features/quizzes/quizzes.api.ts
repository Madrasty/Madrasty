import type {
  AttemptResultView,
  CreateQuestionRequest,
  CreateQuizRequest,
  QuizByLessonResponse,
  QuizQuestionView,
  QuizView,
  SubmitAttemptRequest,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Client for the quizzes API (doc 12 §6). `locale` is forwarded so prompts/options
// resolve for the UI language. All endpoints are authenticated; the server scopes
// by owner (teacher) / enrollment (student).
export const quizzesApi = {
  getByLesson(lessonId: string) {
    return apiRequest<QuizByLessonResponse>(`/quizzes/by-lesson/${lessonId}`, { auth: true });
  },
  getQuiz(quizId: string, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<QuizView>(`/quizzes/${quizId}${qs}`, { auth: true });
  },
  createQuiz(body: CreateQuizRequest, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<QuizView>(`/quizzes${qs}`, { method: 'POST', body, auth: true });
  },
  addQuestion(quizId: string, body: CreateQuestionRequest, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<QuizQuestionView>(`/quizzes/${quizId}/questions${qs}`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
  deleteQuestion(quizId: string, questionId: string) {
    return apiRequest<void>(`/quizzes/${quizId}/questions/${questionId}`, {
      method: 'DELETE',
      auth: true,
    });
  },
  submitAttempt(quizId: string, body: SubmitAttemptRequest, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<AttemptResultView>(`/quizzes/${quizId}/attempts${qs}`, {
      method: 'POST',
      body,
      auth: true,
    });
  },
};
