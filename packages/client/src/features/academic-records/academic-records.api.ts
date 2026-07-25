import type {
  CreateExamRequest,
  ExamView,
  GradebookResponse,
  GradebookStudentRow,
  ListExamsResponse,
  RecordResultRequest,
  ReportCardResponse,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Client for the academic-records API (exams / gradebook / report cards, doc 10
// §3.1). `locale` is forwarded so exam titles + subject names resolve for the UI
// language; all endpoints are authenticated and server-scoped by role.
export const academicRecordsApi = {
  listMyExams(locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<ListExamsResponse>(`/academic-records/exams${qs}`, { auth: true });
  },
  createExam(body: CreateExamRequest, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<ExamView>(`/academic-records/exams${qs}`, { method: 'POST', body, auth: true });
  },
  getGradebook(examId: string, locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<GradebookResponse>(`/academic-records/exams/${examId}/gradebook${qs}`, {
      auth: true,
    });
  },
  recordResult(examId: string, body: RecordResultRequest) {
    return apiRequest<GradebookStudentRow>(`/academic-records/exams/${examId}/results`, {
      method: 'PUT',
      body,
      auth: true,
    });
  },
  getReportCard(studentId: string, opts?: { term?: string; locale?: string }) {
    const query = new URLSearchParams();
    if (opts?.term) query.set('term', opts.term);
    if (opts?.locale) query.set('locale', opts.locale);
    const qs = query.toString();
    return apiRequest<ReportCardResponse>(
      `/academic-records/students/${studentId}/report-card${qs ? `?${qs}` : ''}`,
      { auth: true },
    );
  },
};
