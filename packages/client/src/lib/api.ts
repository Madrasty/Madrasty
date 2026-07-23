import { config } from './config';

// Shape of the server's error envelope (see server lib/error-middleware.ts).
interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

// A typed transport error carrying the server's stable machine `code`, so the UI
// can map it to a translated message (see features/auth error maps).
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Access token lives in memory only (never localStorage) — XSS can't read a
// closure variable as easily, and the refresh token stays in an httpOnly cookie.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Attach the in-memory Bearer access token (for protected endpoints). */
  auth?: boolean;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, signal } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers,
      // Always send/receive the refresh cookie (same-origin via the dev proxy).
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    // Network failure / server down — surface a stable code the UI can translate.
    throw new ApiError(0, 'network_error', 'Could not reach the server.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? 'unknown_error',
      errorBody?.error?.message ?? 'Request failed.',
      errorBody?.error?.details,
    );
  }

  return payload as T;
}
