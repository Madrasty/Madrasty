import type { ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { LandingPage } from '../features/marketing/LandingPage';
import { StudentDashboardPage } from '../features/student-dashboard/StudentDashboardPage';
import { ParentDashboardPage } from '../features/parent-dashboard/ParentDashboardPage';
import { TeacherDashboardPage } from '../features/teacher-dashboard/TeacherDashboardPage';
import { AdminDashboardPage } from '../features/admin-dashboard/AdminDashboardPage';
import { TeacherMarketplacePage } from '../features/home-tutoring/TeacherMarketplacePage';
import { CatalogBrowsePage } from '../features/catalog/CatalogBrowsePage';
import { ProgramDetailPage } from '../features/catalog/ProgramDetailPage';
import { CheckoutReturnPage } from '../features/payments/CheckoutReturnPage';
import { LearningPlayerPage } from '../features/learning-player/LearningPlayerPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ParentRegisterPage } from '../features/auth/ParentRegisterPage';
import { TeacherRegisterPage } from '../features/auth/TeacherRegisterPage';
import { StudentSelfRegisterPage } from '../features/auth/StudentSelfRegisterPage';
import { AddStudentPage } from '../features/auth/AddStudentPage';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { GuardianApprovalPage } from '../features/auth/GuardianApprovalPage';
import { RequireRole } from '../features/auth/RequireRole';
import { MyProgramsPage } from '../features/teacher-authoring/MyProgramsPage';
import { NewProgramPage } from '../features/teacher-authoring/NewProgramPage';
import { ProgramEditorPage } from '../features/teacher-authoring/ProgramEditorPage';
import { USER_ROLES } from '@madrasty/shared';
import { StyleGuidePage } from './StyleGuidePage';

// Wraps an authenticated teacher/admin authoring screen in the teacher shell.
function teacherArea(node: ReactNode): ReactNode {
  return (
    <RequireRole roles={['teacher', 'admin']}>
      <DashboardLayout role="teacher">{node}</DashboardLayout>
    </RequireRole>
  );
}

// Auth-based role gating replaces these public routes once the auth module is
// wired into the client (doc 01 §7); for now every screen is directly reachable
// so each design can be previewed. Exported as a plain array so tests can mount
// individual routes via a memory router.
export const routes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },

  // Auth (doc 11): parent-first (Flow A) + student-self-register (Flow B) + teacher.
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <ParentRegisterPage /> },
  { path: '/register/teacher', element: <TeacherRegisterPage /> },
  { path: '/register/student', element: <StudentSelfRegisterPage /> },
  {
    path: '/register/add-student',
    element: (
      <RequireRole roles={['parent']}>
        <AddStudentPage />
      </RequireRole>
    ),
  },
  {
    // Any authenticated user (used by the admin to rotate the 0000 default).
    path: '/account/password',
    element: (
      <RequireRole roles={[...USER_ROLES]}>
        <ChangePasswordPage />
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
  // Teacher authoring (doc 12) — real, wired to the learning-programs API.
  { path: '/app/teacher/programs', element: teacherArea(<MyProgramsPage />) },
  { path: '/app/teacher/programs/new', element: teacherArea(<NewProgramPage />) },
  { path: '/app/teacher/programs/:programId', element: teacherArea(<ProgramEditorPage />) },
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
  // Learning Program catalog (doc 12) — real, wired to the browse API. Free
  // preview only; enrollment/checkout is roadmap step 4. Reachable directly
  // until auth-based role gating lands; the shell uses the student sidebar.
  {
    path: '/app/catalog',
    element: (
      <DashboardLayout role="student">
        <CatalogBrowsePage />
      </DashboardLayout>
    ),
  },
  {
    path: '/app/catalog/:programId',
    element: (
      <DashboardLayout role="student">
        <ProgramDetailPage />
      </DashboardLayout>
    ),
  },
  { path: '/learn', element: <LearningPlayerPage /> },
  // Post-checkout status screen (doc 04 §3 — polls the webhook-confirmed status).
  { path: '/checkout/return', element: <CheckoutReturnPage /> },
  { path: '/style-guide', element: <StyleGuidePage /> },
];

export const router = createBrowserRouter(routes);
