import type { CookieOptions, Request, Response } from 'express';
import { config } from '../../config/index';
import { asyncHandler } from '../../lib/async-handler';
import { HttpError } from '../../lib/http-error';
import { AuthService } from './auth.service';
import { loginSchema, registerParentSchema } from './auth.schemas';

// The refresh token lives ONLY in this httpOnly cookie — never in a JSON body,
// so client-side JS can't read it (XSS mitigation). Scoped to /api/auth so it's
// only sent to the refresh/logout endpoints.
export const REFRESH_COOKIE_NAME = 'refresh_token';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Secure everywhere except local http dev (a Secure cookie won't be sent
    // over http://localhost). Production is always Secure.
    secure: config.NODE_ENV !== 'development',
    sameSite: 'strict',
    path: '/api/auth',
  };
}

// The controller is a factory over an AuthService instance so the real app wires
// in Postgres+Redis while tests can inject in-memory fakes.
export function createAuthController(service: AuthService) {
  function setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
  }

  const register = asyncHandler(async (req: Request, res: Response) => {
    const input = registerParentSchema.parse(req.body);
    const user = await service.registerParent(input);
    res.status(201).json({ user });
  });

  const login = asyncHandler(async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await service.login(input);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ user, accessToken });
  });

  const refresh = asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!token) {
      throw HttpError.unauthorized('missing_refresh_token', 'No refresh token cookie present.');
    }
    const { accessToken, refreshToken } = await service.refresh(token);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ accessToken });
  });

  const logout = asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await service.logout(token);
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    res.status(200).json({ success: true });
  });

  return { register, login, refresh, logout };
}
