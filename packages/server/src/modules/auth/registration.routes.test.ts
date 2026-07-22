import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { createAuthController } from './auth.controller';
import { RegistrationService } from './registration.service';
import { createRegistrationController } from './registration.controller';
import { requireAuth, requireRole } from './auth.middleware';
import { errorMiddleware } from '../../lib/error-middleware';
import {
  FakeSmsSender,
  InMemoryRefreshTokenStore,
  InMemoryRegistrationRepository,
  InMemoryUserRepository,
} from '../../../test/fakes';

const PARENT_PHONE = '01000000077';

// Wires the auth + registration controllers to in-memory fakes and returns the
// app plus the fakes, so the test can read the OTP/token the parent would receive.
function buildApp() {
  const users = new InMemoryUserRepository();
  const authController = createAuthController(new AuthService(users, new InMemoryRefreshTokenStore()));
  const repo = new InMemoryRegistrationRepository(users);
  const sms = new FakeSmsSender();
  const registrationController = createRegistrationController(
    new RegistrationService(repo, users, sms),
  );

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.post('/api/auth/parent/register', authController.register);
  app.post('/api/auth/login', authController.login);
  app.post('/api/auth/parent/students', requireAuth, requireRole('parent'), registrationController.addStudent);
  app.post('/api/auth/student/self-register', registrationController.selfRegister);
  app.get('/api/auth/guardian-approval/:token', registrationController.getApproval);
  app.post('/api/auth/guardian-approval/:token/approve', requireAuth, requireRole('parent'), registrationController.approve);
  app.post('/api/auth/guardian-approval/:token/reject', requireAuth, requireRole('parent'), registrationController.reject);
  app.use(errorMiddleware);
  return { app, repo, sms };
}

async function registerAndLogin(app: express.Express) {
  await request(app)
    .post('/api/auth/parent/register')
    .send({ fullName: 'Adel Mostafa', email: 'adel@example.com', phone: PARENT_PHONE, password: 'sup3rsecret' });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: 'adel@example.com', password: 'sup3rsecret' });
  return login.body.accessToken as string;
}

describe('registration endpoints', () => {
  it('runs the full student-first approval flow end to end', async () => {
    const { app, repo, sms } = buildApp();
    const accessToken = await registerAndLogin(app);

    // Student self-registers (public) — token is NOT returned to the student.
    const selfReg = await request(app)
      .post('/api/auth/student/self-register')
      .send({ name: 'Layla Adel', grade: 'prep_1', parentMobile: PARENT_PHONE });
    expect(selfReg.status).toBe(201);
    expect(selfReg.body.status).toBe('pending_approval');
    expect(selfReg.body).not.toHaveProperty('approvalToken');

    const studentId = selfReg.body.studentId as string;
    const token = repo.requestForStudent(studentId)!.approvalToken!;
    const code = sms.lastOtpCode();

    // Parent opens the SMS link.
    const view = await request(app).get(`/api/auth/guardian-approval/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.student.name).toBe('Layla Adel');

    // Approve requires the parent's access token + the OTP.
    const approve = await request(app)
      .post(`/api/auth/guardian-approval/${token}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ otp: code });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('approved');
    expect(repo.profileStatus(studentId)).toBe('active');
    expect(repo.approvedLinksFor(studentId)).toHaveLength(1);
  });

  it('rejects approval without an access token (401)', async () => {
    const { app, repo, sms } = buildApp();
    await registerAndLogin(app);
    const selfReg = await request(app)
      .post('/api/auth/student/self-register')
      .send({ name: 'Layla Adel', grade: 'prep_1', parentMobile: PARENT_PHONE });
    const token = repo.requestForStudent(selfReg.body.studentId)!.approvalToken!;

    const res = await request(app)
      .post(`/api/auth/guardian-approval/${token}/approve`)
      .send({ otp: sms.lastOtpCode() });
    expect(res.status).toBe(401);
  });

  it('parent adds a student directly (feature 5)', async () => {
    const { app } = buildApp();
    const accessToken = await registerAndLogin(app);

    const res = await request(app)
      .post('/api/auth/parent/students')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Youssef Adel', dateOfBirth: '2013-05-01', grade: 'primary_4', school: 'Nile', city: 'Cairo' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.studentId).toBeTruthy();
  });
});
