import { Router } from 'express';
import { redis } from '../../lib/redis';
import { AuthService } from './auth.service';
import { DrizzleUserRepository } from './auth.repository';
import { RedisRefreshTokenStore } from './refresh-store';
import { createAuthController } from './auth.controller';
import { RegistrationService } from './registration.service';
import { DrizzleRegistrationRepository } from './registration.repository';
import { LoggingSmsSender } from './sms-sender';
import { createRegistrationController } from './registration.controller';
import { requireAuth, requireRole } from './auth.middleware';

// Composition root for the auth module: wire the real Postgres repos + Redis
// store + SMS sender into the services, expose the router. Endpoints (doc 11 §9):
//   Session
//     POST /api/auth/parent/register              — Flow A step 1
//     POST /api/auth/login                        — issue access token + refresh cookie
//     POST /api/auth/refresh                      — rotate the refresh token
//     POST /api/auth/logout                       — revoke refresh token + clear cookie
//   Registration (doc 11 features 5-7)
//     POST /api/auth/parent/students              — parent adds a student (auth: parent)
//     POST /api/auth/student/self-register        — Flow B step 1 (public)
//     GET  /api/auth/guardian-approval/:token     — parent opens the SMS link (public)
//     POST /api/auth/guardian-approval/:token/approve — approve (auth: parent)
//     POST /api/auth/guardian-approval/:token/reject  — reject (auth: parent)
export function createAuthRouter(): Router {
  const userRepo = new DrizzleUserRepository();
  const authService = new AuthService(userRepo, new RedisRefreshTokenStore(redis));
  const authController = createAuthController(authService);

  const registrationService = new RegistrationService(
    new DrizzleRegistrationRepository(),
    userRepo,
    new LoggingSmsSender(),
  );
  const registrationController = createRegistrationController(registrationService);

  const router = Router();

  // Session
  router.post('/parent/register', authController.register);
  router.post('/login', authController.login);
  router.post('/refresh', authController.refresh);
  router.post('/logout', authController.logout);

  // Registration (features 5-7)
  router.post('/parent/students', requireAuth, requireRole('parent'), registrationController.addStudent);
  router.post('/student/self-register', registrationController.selfRegister);
  router.get('/guardian-approval/:token', registrationController.getApproval);
  router.post(
    '/guardian-approval/:token/approve',
    requireAuth,
    requireRole('parent'),
    registrationController.approve,
  );
  router.post(
    '/guardian-approval/:token/reject',
    requireAuth,
    requireRole('parent'),
    registrationController.reject,
  );

  return router;
}
