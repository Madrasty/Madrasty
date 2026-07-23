import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { AuthUser } from '@madrasty/shared';
import i18n from '../src/lib/i18n';
import { routes } from '../src/app/router';
import { AuthProvider } from '../src/features/auth/AuthProvider';

const PARENT: AuthUser = {
  id: 'u1',
  fullName: 'Sarah Ahmed',
  email: 'sarah@example.com',
  phone: '01000000000',
  role: 'parent',
  localePreference: 'en',
  status: 'active',
  verificationLevel: 1,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('login flow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('logs in and lands on the role dashboard, sending credentials to the API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith('/api/auth/login')) {
        return jsonResponse({ user: PARENT, accessToken: 'access-token' });
      }
      return jsonResponse({ error: { code: 'not_found', message: 'nope' } }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = createMemoryRouter(routes, { initialEntries: ['/login'] });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    await user.type(await screen.findByLabelText('Email or phone'), 'sarah@example.com');
    await user.type(screen.getByLabelText('Password'), 'sup3rsecret');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    // Redirected to the parent dashboard.
    expect(await screen.findByText(/Welcome back, Sarah$/)).toBeInTheDocument();

    // The API was called with the credentials and cookie mode.
    const loginCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/api/auth/login'));
    expect(loginCall).toBeDefined();
    const init = loginCall![1]!;
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({
      identifier: 'sarah@example.com',
      password: 'sup3rsecret',
    });
  });

  it('shows a translated error when credentials are rejected', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: 'invalid_credentials', message: 'Invalid credentials.' } }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    const router = createMemoryRouter(routes, { initialEntries: ['/login'] });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    await user.type(await screen.findByLabelText('Email or phone'), 'sarah@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Incorrect email/phone or password.')).toBeInTheDocument();
  });
});
