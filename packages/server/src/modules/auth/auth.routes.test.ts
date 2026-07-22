import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { createAuthController, REFRESH_COOKIE_NAME } from './auth.controller';
import { requireAuth } from './auth.middleware';
import { errorMiddleware } from '../../lib/error-middleware';
import {
  InMemoryRefreshTokenStore,
  InMemoryUserRepository,
} from '../../../test/fakes';

// Builds a real Express app wired to in-memory fakes — exercises the full HTTP
// path (validation, cookies, error shaping) without Postgres or Redis.
function buildTestApp() {
  const service = new AuthService(new InMemoryUserRepository(), new InMemoryRefreshTokenStore());
  const c = createAuthController(service);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.post('/api/auth/parent/register', c.register);
  app.post('/api/auth/login', c.login);
  app.post('/api/auth/refresh', c.refresh);
  app.post('/api/auth/logout', c.logout);
  // A protected probe endpoint to prove the auth middleware works.
  app.get('/api/me', requireAuth, (req, res) => res.json({ id: req.user!.id, role: req.user!.role }));
  app.use(errorMiddleware);
  return app;
}

const registration = {
  fullName: 'Omar Farouk',
  email: 'omar@example.com',
  phone: '01000000002',
  password: 'sup3rsecret',
};

// Extracts the refresh cookie string to send back on a follow-up request.
function refreshCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[];
  const found = cookies?.find((ck) => ck.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!found) throw new Error('no refresh cookie set');
  return found.split(';')[0];
}

describe('auth endpoints', () => {
  let app: express.Express;
  beforeEach(() => {
    app = buildTestApp();
  });

  it('POST /parent/register creates a parent (201) and returns no token in the body', async () => {
    const res = await request(app).post('/api/auth/parent/register').send(registration);
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('parent');
    expect(res.body).not.toHaveProperty('accessToken');
    expect(res.body).not.toHaveProperty('refreshToken');
  });

  it('rejects invalid registration input with 400', async () => {
    const res = await request(app)
      .post('/api/auth/parent/register')
      .send({ ...registration, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('POST /login returns an access token in the body and the refresh token only as an httpOnly cookie', async () => {
    await request(app).post('/api/auth/parent/register').send(registration);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: registration.email, password: registration.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body).not.toHaveProperty('refreshToken');

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
  });

  it('the access token opens a protected endpoint; a missing token is 401', async () => {
    await request(app).post('/api/auth/parent/register').send(registration);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: registration.email, password: registration.password });

    const ok = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.role).toBe('parent');

    const denied = await request(app).get('/api/me');
    expect(denied.status).toBe(401);
  });

  it('POST /refresh rotates the cookie and issues a new access token', async () => {
    await request(app).post('/api/auth/parent/register').send(registration);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: registration.email, password: registration.password });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie(login));
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    // A brand-new refresh cookie is issued.
    expect(refreshCookie(res)).not.toBe(refreshCookie(login));
  });

  it('POST /logout clears the cookie and revokes the token', async () => {
    await request(app).post('/api/auth/parent/register').send(registration);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: registration.email, password: registration.password });
    const cookie = refreshCookie(login);

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);
    // The cleared cookie has an expiry in the past.
    const cleared = (out.headers['set-cookie'] as unknown as string[])[0];
    expect(cleared).toContain(`${REFRESH_COOKIE_NAME}=`);

    // The old refresh token no longer works.
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(reuse.status).toBe(401);
  });
});
