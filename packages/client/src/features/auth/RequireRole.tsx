import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '@madrasty/shared';
import { useAuth } from './AuthProvider';
import { roleHome } from '../../app/navigation';

interface RequireRoleProps {
  roles: UserRole[];
  children: ReactNode;
}

// Client-side gate for screens the API restricts to certain roles (add-student,
// guardian approval). This is UX only — the server enforces RBAC independently
// (CLAUDE.md: "RBAC is enforced at the API layer, not just the UI").
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin" aria-hidden="true">
          progress_activity
        </span>
      </div>
    );
  }

  if (status === 'anonymous' || !user) {
    // Bounce to login, remembering where the user was headed.
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return <>{children}</>;
}
