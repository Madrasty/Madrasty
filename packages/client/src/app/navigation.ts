// The dashboard roles that have a rendered view in this scaffold. `center_admin`
// (doc 11) reuses the admin shell until it gets its own screens.
export type DashboardRole = 'student' | 'parent' | 'teacher' | 'admin';

export interface NavItem {
  /** i18n key under `nav.*`. */
  labelKey: string;
  icon: string;
  /** Absent = placeholder for a screen not built yet (shown, not linked). */
  path?: string;
}

export const DASHBOARD_ROLES: DashboardRole[] = ['student', 'parent', 'teacher', 'admin'];

export function dashboardPath(role: DashboardRole): string {
  return `/app/${role}`;
}

// Per-role sidebar. Paths point only at screens that exist in this scaffold;
// the rest are placeholders until their modules are built (roadmap docs 09-13).
export const ROLE_NAV: Record<DashboardRole, NavItem[]> = {
  student: [
    { labelKey: 'dashboard', icon: 'dashboard', path: '/app/student' },
    { labelKey: 'learningPrograms', icon: 'school', path: '/learn' },
    { labelKey: 'marketplace', icon: 'storefront', path: '/app/marketplace' },
    { labelKey: 'tutoring', icon: 'record_voice_over' },
    { labelKey: 'profile', icon: 'account_circle' },
  ],
  parent: [
    { labelKey: 'dashboard', icon: 'dashboard', path: '/app/parent' },
    { labelKey: 'children', icon: 'family_restroom' },
    { labelKey: 'marketplace', icon: 'storefront', path: '/app/marketplace' },
    { labelKey: 'tutoring', icon: 'record_voice_over' },
    { labelKey: 'billing', icon: 'payments' },
    { labelKey: 'analytics', icon: 'analytics' },
  ],
  teacher: [
    { labelKey: 'dashboard', icon: 'dashboard', path: '/app/teacher' },
    { labelKey: 'myPrograms', icon: 'menu_book', path: '/app/teacher/programs' },
    { labelKey: 'students', icon: 'groups' },
    { labelKey: 'liveClasses', icon: 'videocam' },
    { labelKey: 'earnings', icon: 'account_balance_wallet' },
  ],
  admin: [
    { labelKey: 'dashboard', icon: 'dashboard', path: '/app/admin' },
    { labelKey: 'teacherVerification', icon: 'how_to_reg' },
    { labelKey: 'programApprovals', icon: 'fact_check' },
    { labelKey: 'users', icon: 'manage_accounts' },
    { labelKey: 'reports', icon: 'monitoring' },
  ],
};

// Mobile bottom-tab bar — a compact subset, consistent across the mockups.
export const ROLE_BOTTOM_NAV: Record<DashboardRole, NavItem[]> = {
  student: [
    { labelKey: 'home', icon: 'home', path: '/app/student' },
    { labelKey: 'learn', icon: 'menu_book', path: '/learn' },
    { labelKey: 'tutor', icon: 'record_voice_over', path: '/app/marketplace' },
    { labelKey: 'profile', icon: 'account_circle' },
  ],
  parent: [
    { labelKey: 'home', icon: 'home', path: '/app/parent' },
    { labelKey: 'learn', icon: 'menu_book', path: '/app/marketplace' },
    { labelKey: 'tutor', icon: 'record_voice_over', path: '/app/marketplace' },
    { labelKey: 'profile', icon: 'account_circle' },
  ],
  teacher: [
    { labelKey: 'home', icon: 'home', path: '/app/teacher' },
    { labelKey: 'learn', icon: 'menu_book' },
    { labelKey: 'tutor', icon: 'record_voice_over' },
    { labelKey: 'profile', icon: 'account_circle' },
  ],
  admin: [
    { labelKey: 'home', icon: 'home', path: '/app/admin' },
    { labelKey: 'learn', icon: 'fact_check' },
    { labelKey: 'tutor', icon: 'how_to_reg' },
    { labelKey: 'profile', icon: 'account_circle' },
  ],
};

// A safe cast helper: only the four dashboard roles above are renderable.
export function isDashboardRole(value: string): value is DashboardRole {
  return (DASHBOARD_ROLES as string[]).includes(value);
}

// Where a signed-in user lands after login. `center_admin` (doc 11) reuses the
// admin shell until it gets dedicated screens.
export function roleHome(role: string): string {
  if (role === 'center_admin') return dashboardPath('admin');
  return isDashboardRole(role) ? dashboardPath(role) : dashboardPath('student');
}
