import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { LandingPage } from '../features/marketing/LandingPage';
import { StudentDashboardPage } from '../features/student-dashboard/StudentDashboardPage';
import { ParentDashboardPage } from '../features/parent-dashboard/ParentDashboardPage';
import { TeacherDashboardPage } from '../features/teacher-dashboard/TeacherDashboardPage';
import { AdminDashboardPage } from '../features/admin-dashboard/AdminDashboardPage';
import { TeacherMarketplacePage } from '../features/home-tutoring/TeacherMarketplacePage';
import { LearningPlayerPage } from '../features/learning-player/LearningPlayerPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ParentRegisterPage } from '../features/auth/ParentRegisterPage';
import { StudentSelfRegisterPage } from '../features/auth/StudentSelfRegisterPage';
import { AddStudentPage } from '../features/auth/AddStudentPage';
import { GuardianApprovalPage } from '../features/auth/GuardianApprovalPage';
import { RequireRole } from '../features/auth/RequireRole';
import { StyleGuidePage } from './StyleGuidePage';

// Auth-based role gating replaces these public routes once the auth module is
// wired into the client (doc 01 §7); for now every screen is directly reachable
// so each design can be previewed. Exported as a plain array so tests can mount
// individual routes via a memory router.
export const routes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },

  // Auth (doc 11): parent-first (Flow A) + student-self-register (Flow B).
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <ParentRegisterPage /> },
  { path: '/register/student', element: <StudentSelfRegisterPage /> },
  {
    path: '/register/add-student',
    element: (
      <RequireRole roles={['parent']}>
        <AddStudentPage />
      </RequireRole>
    ),
  },
  { path: '/guardian-approval/:token', element: <GuardianApprovalPage /> },
  {
    path: '/app/student',
    element: (
      <DashboardLayout role="student">
        <StudentDashboardPage />
      </DashboardLayout>
    ),
  },
  {
    path: '/app/parent',
    element: (
      <DashboardLayout role="parent">
        <ParentDashboardPage />
      </DashboardLayout>
    ),
  },
  {
    path: '/app/teacher',
    element: (
      <DashboardLayout role="teacher">
        <TeacherDashboardPage />
      </DashboardLayout>
    ),
  },
  {
    path: '/app/admin',
    element: (
      <DashboardLayout role="admin">
        <AdminDashboardPage />
      </DashboardLayout>
    ),
  },
  {
    path: '/app/marketplace',
    element: (
      <DashboardLayout role="student">
        <TeacherMarketplacePage />
      </DashboardLayout>
    ),
  },
  { path: '/learn', element: <LearningPlayerPage /> },
  { path: '/style-guide', element: <StyleGuidePage /> },
];

export const router = createBrowserRouter(routes);
