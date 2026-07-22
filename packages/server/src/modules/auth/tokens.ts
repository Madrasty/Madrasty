import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@madrasty/shared';
import { config } from '../../config/index';

// Two-token model (doc 01 §5, doc 11): a short-lived access token signed with
// JWT_SECRET, and a long-lived refresh token signed with a DISTINCT
// JWT_REFRESH_SECRET so an access secret leak can't mint refresh tokens.

export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
}

export interface RefreshTokenPayload {
  sub: string; // user id
  role: UserRole;
  jti: string; // unique token id, tracked in Redis for rotation/revocation
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

// Returns the signed token plus the jti and its expiry (unix seconds) so the
// caller can register the jti in the refresh store with a matching TTL.
export function signRefreshToken(user: {
  id: string;
  role: UserRole;
}): { token: string; jti: string; expiresAt: number } {
  const jti = randomUUID();
  const token = jwt.sign({ sub: user.id, role: user.role }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN,
    jwtid: jti,
  } as jwt.SignOptions);
  const decoded = jwt.decode(token) as { exp: number };
  return { token, jti, expiresAt: decoded.exp };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.JWT_SECRET) as AccessTokenPayload & jwt.JwtPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshTokenPayload & jwt.JwtPayload;
}
