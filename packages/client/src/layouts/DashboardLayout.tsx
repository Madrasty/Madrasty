import type { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';
import { ROLE_NAV, ROLE_BOTTOM_NAV, dashboardRoleForUser } from '../app/navigation';
import { useAuth } from '../features/auth/AuthProvider';

interface DashboardLayoutProps {
  children: ReactNode;
}

// Shared shell for every role dashboard (and the shared catalog/marketplace).
// The shell is driven by the AUTHENTICATED user's role — every `/app/*` route is
// wrapped in RequireRole, so this only renders once a user is present, and the
// sidebar always matches who is actually logged in (no cross-role preview).
export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user } = useAuth();
  const role = dashboardRoleForUser(user?.role ?? 'student');

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <Sidebar items={ROLE_NAV[role]} />
      <TopBar />
      <main className="app-container pb-24 pt-16 md:ms-[280px] md:pb-unit-xl">
        <div className="py-unit-lg">{children}</div>
      </main>
      <BottomNav items={ROLE_BOTTOM_NAV[role]} />
    </div>
  );
}
