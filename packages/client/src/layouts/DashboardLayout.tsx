import type { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';
import { ROLE_NAV, ROLE_BOTTOM_NAV, type DashboardRole } from '../app/navigation';

interface DashboardLayoutProps {
  /** Drives which sidebar/bottom-nav + role-switcher state renders. */
  role: DashboardRole;
  children: ReactNode;
}

// Shared shell for every role dashboard (and the marketplace). Real role gating
// happens at the router/auth layer once auth lands (doc 01 §7); the RoleSwitcher
// in the top bar is a dev affordance for previewing each role.
export function DashboardLayout({ role, children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <Sidebar items={ROLE_NAV[role]} />
      <TopBar role={role} />
      <main className="app-container pb-24 pt-16 md:ms-[280px] md:pb-unit-xl">
        <div className="py-unit-lg">{children}</div>
      </main>
      <BottomNav items={ROLE_BOTTOM_NAV[role]} />
    </div>
  );
}
