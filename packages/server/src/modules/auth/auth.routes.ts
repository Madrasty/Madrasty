import { Router } from 'express';
import { redis } from '../../lib/redis';
import { AuthService } from './auth.service';
import { DrizzleUserRepository } from './auth.repository';
import { RedisRefreshTokenStore } from './refresh-store';
import { createAuthController } from './auth.controller';

// Composition root for the auth module: wire the real Postgres repo + Redis
// refresh store into the service, expose the router. Endpoints (doc 11 §9):
//   POST /api/auth/parent/register  — Flow A step 1 (create parent root account)
//   POST /api/auth/login            — issue access token + refresh cookie
//   POST /api/auth/refresh          — rotate the refresh token
//   POST /api/auth/logout           — revoke refresh token + clear cookie
export function createAuthRouter(): Router {
  const service = new AuthService(
    new DrizzleUserRepository(),
    new RedisRefreshTokenStore(redis),
  );
  const controller = createAuthController(service);

  const router = Router();
  router.post('/parent/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  return router;
}
