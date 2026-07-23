import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AuthUser,
  LoginRequest,
  RegisterParentRequest,
  RegisterTeacherRequest,
} from '@madrasty/shared';
import { setAccessToken } from '../../lib/api';
import { authApi } from './auth.api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (input: LoginRequest) => Promise<AuthUser>;
  registerParent: (input: RegisterParentRequest) => Promise<AuthUser>;
  registerTeacher: (input: RegisterTeacherRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// The non-sensitive user profile is cached here so a page reload can show the
// user immediately while the session is re-validated. The refresh token (the
// real credential) stays in an httpOnly cookie; the access token stays in memory.
const USER_STORAGE_KEY = 'madrasty_user';

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const persist = useCallback((nextUser: AuthUser | null, accessToken: string | null) => {
    setAccessToken(accessToken);
    setUser(nextUser);
    setStatus(nextUser ? 'authenticated' : 'anonymous');
    if (nextUser) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }, []);

  // On mount, try to restore a session: if the refresh cookie is still valid the
  // server returns a fresh access token, and we rehydrate the user from cache.
  useEffect(() => {
    let cancelled = false;
    const stored = readStoredUser();
    if (!stored) {
      setStatus('anonymous');
      return;
    }
    authApi
      .refresh()
      .then(({ accessToken }) => {
        if (!cancelled) persist(stored, accessToken);
      })
      .catch(() => {
        if (!cancelled) persist(null, null);
      });
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const login = useCallback<AuthContextValue['login']>(
    async (input) => {
      const { user: loggedIn, accessToken } = await authApi.login(input);
      persist(loggedIn, accessToken);
      return loggedIn;
    },
    [persist],
  );

  const registerParent = useCallback<AuthContextValue['registerParent']>(
    async (input) => {
      // Register creates the account but issues no session; log in right after so
      // the parent lands authenticated and can continue Flow A (add a student).
      const { user: created } = await authApi.registerParent(input);
      await login({ identifier: input.email, password: input.password });
      return created;
    },
    [login],
  );

  const registerTeacher = useCallback<AuthContextValue['registerTeacher']>(
    async (input) => {
      // Same as parent: register, then auto-login into the teacher dashboard.
      const { user: created } = await authApi.registerTeacher(input);
      await login({ identifier: input.email, password: input.password });
      return created;
    },
    [login],
  );

  const logout = useCallback<AuthContextValue['logout']>(async () => {
    try {
      await authApi.logout();
    } finally {
      persist(null, null);
    }
  }, [persist]);

  const value = useMemo(
    () => ({ user, status, login, registerParent, registerTeacher, logout }),
    [user, status, login, registerParent, registerTeacher, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
