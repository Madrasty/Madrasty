import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import i18n from '../src/lib/i18n';
import { routes } from '../src/app/router';
import { AuthProvider } from '../src/features/auth/AuthProvider';

// Smoke-tests every route in English: each must mount without throwing and show
// its heading. Guards against missing i18n keys, bad interpolations, and hook
// misuse across the ported screens. A fresh memory router per case avoids the
// browser-router singleton retaining location between renders. Wrapped in
// AuthProvider because the dashboards/top bar read the auth context.
const CASES: Array<{ path: string; heading: RegExp }> = [
  { path: '/', heading: /Empowering Egypt/ },
  { path: '/login', heading: /Welcome back/ },
  { path: '/register', heading: /Create a parent account/ },
  { path: '/register/teacher', heading: /Create a teacher account/ },
  { path: '/register/student', heading: /Student sign-up/ },
  { path: '/app/student', heading: /Welcome back, Sarah!/ },
  { path: '/app/parent', heading: /Welcome back, Sarah$/ },
  { path: '/app/teacher', heading: /Welcome back, Mr\. Hassan/ },
  { path: '/app/admin', heading: /Platform overview/ },
  { path: '/app/marketplace', heading: /Find a private tutor/ },
  { path: '/learn', heading: /core concepts of calculus/ },
  { path: '/style-guide', heading: /Madrasty Design System/ },
];

describe('route smoke tests', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    cleanup();
  });

  it.each(CASES)('renders $path', async ({ path, heading }) => {
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );
    expect(await screen.findByText(heading)).toBeInTheDocument();
  });
});
