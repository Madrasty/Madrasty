import type {
  AddStudentRequest,
  AddStudentResponse,
  AuthUser,
  GuardianApprovalActionResponse,
  GuardianApprovalView,
  GuardianApproveRequest,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  RefreshResponse,
  RegisterParentRequest,
  RegisterParentResponse,
  StudentSelfRegisterRequest,
  StudentSelfRegisterResponse,
} from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// One function per auth endpoint (server modules/auth/index.ts). Paths are
// relative to config.apiBaseUrl (/api), e.g. -> /api/auth/login.
export const authApi = {
  registerParent(body: RegisterParentRequest) {
    return apiRequest<RegisterParentResponse>('/auth/parent/register', { method: 'POST', body });
  },
  login(body: LoginRequest) {
    return apiRequest<LoginResponse>('/auth/login', { method: 'POST', body });
  },
  refresh() {
    return apiRequest<RefreshResponse>('/auth/refresh', { method: 'POST' });
  },
  logout() {
    return apiRequest<LogoutResponse>('/auth/logout', { method: 'POST' });
  },
  addStudent(body: AddStudentRequest) {
    return apiRequest<AddStudentResponse>('/auth/parent/students', { method: 'POST', body, auth: true });
  },
  selfRegister(body: StudentSelfRegisterRequest) {
    return apiRequest<StudentSelfRegisterResponse>('/auth/student/self-register', {
      method: 'POST',
      body,
    });
  },
  getApproval(token: string, signal?: AbortSignal) {
    return apiRequest<GuardianApprovalView>(`/auth/guardian-approval/${encodeURIComponent(token)}`, {
      signal,
    });
  },
  approve(token: string, body: GuardianApproveRequest) {
    return apiRequest<GuardianApprovalActionResponse>(
      `/auth/guardian-approval/${encodeURIComponent(token)}/approve`,
      { method: 'POST', body, auth: true },
    );
  },
  reject(token: string) {
    return apiRequest<GuardianApprovalActionResponse>(
      `/auth/guardian-approval/${encodeURIComponent(token)}/reject`,
      { method: 'POST', auth: true },
    );
  },
};

export type { AuthUser };
