import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { AuthUser } from '@madrasty/shared';
import i18n from '../src/lib/i18n';
import { routes } from '../src/app/router';
import { AuthProvider } from '../src/features/auth/AuthProvider';

const TEACHER: AuthUser = {
  id: 't1',
  fullName: 'Ms Demo',
  email: 'teacher@example.com',
  phone: '01000000000',
  role: 'teacher',
  localePreference: 'en',
  status: 'active',
  verificationLevel: 1,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

describe('teacher authoring', () => {
  beforeEach(async () => {
    localStorage.clear();
    // A stored user makes AuthProvider bootstrap via /auth/refresh → authenticated.
    localStorage.setItem('madrasty_user', JSON.stringify(TEACHER));
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('an authenticated teacher sees the empty "My programs" state', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'tok' });
      if (url.endsWith('/api/learning-programs/mine')) return json({ programs: [] });
      return json({ error: { code: 'not_found', message: 'x' } }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/app/teacher/programs');

    expect(await screen.findByText(/haven't created any programs yet/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/api/learning-programs/mine')),
    ).toBe(true);
  });

  it('creating a program posts the title and lands on the editor', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) return json({ accessToken: 'tok' });
      if (url.endsWith('/api/learning-programs') && init?.method === 'POST') {
        return json(
          { id: 'p1', teacherId: 't1', subjectId: null, gradeLevel: 'Grade 8', semester: null, priceEgp: '300', status: 'draft', title: 'Algebra', description: null, metadata: {} },
          201,
        );
      }
      if (url.endsWith('/api/learning-programs/p1')) {
        return json({ id: 'p1', teacherId: 't1', subjectId: null, gradeLevel: 'Grade 8', semester: null, priceEgp: '300', status: 'draft', title: 'Algebra', description: null, chapters: [] });
      }
      return json({ error: { code: 'not_found', message: 'x' } }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderAt('/app/teacher/programs/new');

    await user.type(await screen.findByLabelText('Title (English)'), 'Algebra');
    await user.click(screen.getByRole('button', { name: 'Create program' }));

    // Landed on the editor (program header + empty-chapters prompt).
    expect(await screen.findByText('Algebra')).toBeInTheDocument();
    expect(await screen.findByText(/No chapters yet/i)).toBeInTheDocument();

    // The POST carried the localized title.
    const post = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith('/api/learning-programs') && (c[1] as RequestInit)?.method === 'POST',
    );
    expect(post).toBeDefined();
    expect(JSON.parse((post![1] as RequestInit).body as string).title).toEqual({ en: 'Algebra' });
  });
});
