import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { LandingPage } from '../features/marketing/LandingPage';
import { StudentDashboardPage } from '../features/student-dashboard/StudentDashboardPage';
import { ParentDashboardPage } from '../features/parent-dashboard/ParentDashboardPage';
import { TeacherDashboardPage } from '../features/teacher-dashboard/TeacherDashboardPage';
import { AdminDashboardPage } from '../features/admin-dashboard/AdminDashboardPage';
import { TeacherVerificationPage } from '../features/admin-dashboard/TeacherVerificationPage';
import { ProgramApprovalsPage } from '../features/admin-dashboard/ProgramApprovalsPage';
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
import { useAuth } from '../features/auth/AuthProvider';
import { MessagingPage } from '../features/messaging/MessagingPage';
import { TeacherGradebookPage } from '../features/academic-records/TeacherGradebookPage';
import { ReportCardPage } from '../features/academic-records/ReportCardPage';
import { MyProgramsPage } from '../features/teacher-authoring/MyProgramsPage';
import { NewProgramPage } from '../features/teacher-authoring/NewProgramPage';
import { ProgramEditorPage } from '../features/teacher-authoring/ProgramEditorPage';
import { USER_ROLES, type UserRole } from '@madrasty/shared';
import { roleHome } from './navigation';

// Every `/app/*` screen is gated: RequireRole redirects anonymous users to
// /login and wrong-role users to their own home (roleHome). The DashboardLayout
// shell derives its role from the authenticated user, so the sidebar always
// matches who is logged in — no one can preview another role's pages.
function gated(roles: UserRole[], node: ReactNode): ReactNode {
  return (
    <RequireRole roles={roles}>
      <DashboardLayout>{node}</DashboardLayout>
    </RequireRole>
  );
}

const teacherArea = (node: ReactNode) => gated(['teacher'], node);
const adminArea = (node: ReactNode) => gated(['admin', 'center_admin'], node);

// Bare `/app` → send the user to their own dashboard (or login if anonymous).
function AppIndexRedirect() {
  const { status, user } = useAuth();
  if (status === 'loading') return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome(user.role)} replace />;
}

// Exported as a plain array so tests can mount individual routes via a memory
// router.
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

  { path: '/app', element: <AppIndexRedirect /> },

  // Role dashboards — each gated to its own role.
  { path: '/app/student', element: gated(['student'], <StudentDashboardPage />) },
  { path: '/app/parent', element: gated(['parent'], <ParentDashboardPage />) },
  { path: '/app/teacher', element: gated(['teacher'], <TeacherDashboardPage />) },
  { path: '/app/admin', element: adminArea(<AdminDashboardPage />) },

  // Parent–teacher messaging (doc 10).
  { path: '/app/parent/messages', element: gated(['parent'], <MessagingPage />) },
  { path: '/app/teacher/messages', element: teacherArea(<MessagingPage />) },

  // Exams & report cards (doc 10).
  { path: '/app/teacher/gradebook', element: teacherArea(<TeacherGradebookPage />) },
  { path: '/app/student/report-card', element: gated(['student'], <ReportCardPage />) },
  { path: '/app/parent/report-card', element: gated(['parent'], <ReportCardPage />) },

  // Teacher authoring (doc 12).
  { path: '/app/teacher/programs', element: teacherArea(<MyProgramsPage />) },
  { path: '/app/teacher/programs/new', element: teacherArea(<NewProgramPage />) },
  { path: '/app/teacher/programs/:programId', element: teacherArea(<ProgramEditorPage />) },

  // Admin governance (doc 09) — admin-only.
  { path: '/app/admin/teachers', element: adminArea(<TeacherVerificationPage />) },
  { path: '/app/admin/programs', element: adminArea(<ProgramApprovalsPage />) },

  // Shared browse screens — student + parent, shell matches the actual viewer.
  { path: '/app/marketplace', element: gated(['student', 'parent'], <TeacherMarketplacePage />) },
  { path: '/app/catalog', element: gated(['student', 'parent'], <CatalogBrowsePage />) },
  { path: '/app/catalog/:programId', element: gated(['student', 'parent'], <ProgramDetailPage />) },

  {
    path: '/learn',
    element: (
      <RequireRole roles={['student']}>
        <LearningPlayerPage />
      </RequireRole>
    ),
  },
  // Post-checkout status screen (doc 04 §3) — the buyer (student/parent).
  {
    path: '/checkout/return',
    element: (
      <RequireRole roles={['student', 'parent']}>
        <CheckoutReturnPage />
      </RequireRole>
    ),
  },
];

export const router = createBrowserRouter(routes);
