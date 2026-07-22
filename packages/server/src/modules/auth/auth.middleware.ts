import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@madrasty/shared';
import { HttpError } from '../../lib/http-error';
import { verifyAccessToken } from './tokens';

// Verifies the Bearer access token and attaches the principal to req.user.
// RBAC is enforced here at the API layer, not just in the UI (CLAUDE.md, doc 11).
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw HttpError.unauthorized('missing_token', 'Missing or malformed Authorization header.');
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    throw HttpError.unauthorized('invalid_token', 'Invalid or expired access token.');
  }
}

// Attaches req.user IF a valid Bearer token is present, but never rejects when
// it is missing/invalid. For public endpoints that reveal more to an owner/admin
// (e.g. a teacher previewing their own draft program).
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
      req.user = { id: payload.sub, role: payload.role };
    } catch {
      // Ignore — treat as an anonymous viewer.
    }
  }
  next();
}

// Guards an endpoint to specific roles. Use after requireAuth, e.g.
// router.post('/pay', requireAuth, requireRole('parent'), handler) — money and
// account-structure actions must confirm the actor is the parent (doc 11 §6).
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw HttpError.unauthorized('missing_token', 'Authentication required.');
    }
    if (!roles.includes(req.user.role)) {
      throw HttpError.forbidden('insufficient_role', 'You do not have access to this resource.');
    }
    next();
  };
}
