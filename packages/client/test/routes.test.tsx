import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import i18n from '../src/lib/i18n';
import { routes } from '../src/app/router';
import { AuthProvider } from '../src/features/auth/AuthProvider';

// Two guarantees, in English:
// 1. Public routes mount and show their heading (no missing i18n keys / hook misuse).
// 2. Every gated `/app/*` (and /learn, /checkout/return) redirects an anonymous
//    visitor to /login — the production access rule, with no way to preview a
//    role's page without logging in.
// A fresh memory router per case avoids the browser-router singleton retaining
// location. Wrapped in AuthProvider because RequireRole/TopBar read auth context.
const PUBLIC_CASES: Array<{ path: string; heading: RegExp }> = [
  { path: '/', heading: /Empowering Egypt/ },
  { path: '/login', heading: /Welcome back/ },
  { path: '/register', heading: /Create a parent account/ },
  { path: '/register/teacher', heading: /Create a teacher account/ },
  { path: '/register/student', heading: /Student sign-up/ },
];

// Anonymous → RequireRole sends these to /login (heading: "Welcome back").
const GATED_PATHS = [
  '/app/student',
  '/app/parent',
  '/app/teacher',
  '/app/admin',
  '/app/marketplace',
  '/app/catalog',
  '/app/catalog/some-program-id',
  '/app/teacher/homework',
  '/app/homework/some-assignment-id',
  '/checkout/return',
  '/learn',
];

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

describe('route smoke tests', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    cleanup();
  });

  it.each(PUBLIC_CASES)('renders public $path', async ({ path, heading }) => {
    renderAt(path);
    expect(await screen.findByText(heading)).toBeInTheDocument();
  });

  it.each(GATED_PATHS)('redirects anonymous %s to login', async (path) => {
    renderAt(path);
    expect(await screen.findByText(/Welcome back/)).toBeInTheDocument();
  });
});
