import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config/index';
import { RegistrationService } from './registration.service';
import type { UserRecord } from './auth.repository';
import {
  FakeSmsSender,
  InMemoryRegistrationRepository,
  InMemoryUserRepository,
} from '../../../test/fakes';

const PARENT_PHONE = '01000000055';

const studentInput = {
  name: 'Youssef Adel',
  dateOfBirth: '2013-05-01',
  grade: 'primary_4',
  school: 'Nile International',
  city: 'Cairo',
  relationship: 'mother' as const,
};

const selfRegInput = { name: 'Layla Adel', grade: 'prep_1', parentMobile: PARENT_PHONE };

// Flips the first digit so the wrong code is guaranteed different but same length.
function wrongCode(code: string): string {
  return (code[0] === '9' ? '0' : '9') + code.slice(1);
}

describe('RegistrationService', () => {
  let users: InMemoryUserRepository;
  let repo: InMemoryRegistrationRepository;
  let sms: FakeSmsSender;
  let service: RegistrationService;
  let parent: UserRecord;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    repo = new InMemoryRegistrationRepository(users);
    sms = new FakeSmsSender();
    service = new RegistrationService(repo, users, sms);
    parent = await users.createParent({
      fullName: 'Adel Mostafa',
      email: 'adel@example.com',
      phone: PARENT_PHONE,
      passwordHash: 'x',
      localePreference: 'ar',
    });
  });

  describe('feature 5 — parent adds a student', () => {
    it('creates an active student linked to the parent with approved_at set', async () => {
      const result = await service.addStudent(parent.id, studentInput);

      expect(result.status).toBe('active');
      expect(repo.profileStatus(result.studentId)).toBe('active');

      const links = repo.approvedLinksFor(result.studentId);
      expect(links).toHaveLength(1);
      expect(links[0].parentId).toBe(parent.id);
      expect(links[0].relationship).toBe('mother');
      expect(links[0].approvedAt).toBeInstanceOf(Date);
    });
  });

  describe('feature 6 — student self-registration (Flow B)', () => {
    it('creates a PENDING student with no approved link (no content access)', async () => {
      const result = await service.selfRegister(selfRegInput);

      expect(result.status).toBe('pending_approval');
      expect(repo.profileStatus(result.studentId)).toBe('pending_approval');
      // The hard gate: no approved guardian link exists yet.
      expect(repo.approvedLinksFor(result.studentId)).toHaveLength(0);
    });

    it('creates an awaiting_parent request and matches the existing parent by phone', async () => {
      const result = await service.selfRegister(selfRegInput);
      const req = repo.requestForStudent(result.studentId);

      expect(req?.status).toBe('awaiting_parent');
      expect(req?.matchedParentId).toBe(parent.id);
      expect(req?.approvalToken).toBeTruthy();
    });

    it('sends an OTP to the parent mobile and never returns the token in the body', async () => {
      const result = await service.selfRegister(selfRegInput);

      expect(sms.last?.to).toBe(PARENT_PHONE);
      expect(sms.lastOtpCode()).toMatch(new RegExp(`^\\d{${config.OTP_CODE_LENGTH}}$`));
      expect(result).not.toHaveProperty('approvalToken');
    });
  });

  describe('feature 7 — guardian approval', () => {
    async function selfRegisterAndCollect() {
      const { studentId } = await service.selfRegister(selfRegInput);
      const token = repo.requestForStudent(studentId)!.approvalToken!;
      const code = sms.lastOtpCode();
      return { studentId, token, code };
    }

    it('GET request details returns the pending student and status', async () => {
      const { token } = await selfRegisterAndCollect();
      const view = await service.getApprovalRequest(token);
      expect(view.student.name).toBe(selfRegInput.name);
      expect(view.student.grade).toBe(selfRegInput.grade);
      expect(view.status).toBe('awaiting_parent');
    });

    it('rejects an unknown token', async () => {
      await expect(service.getApprovalRequest('nope')).rejects.toMatchObject({
        code: 'approval_request_not_found',
      });
    });

    it('approve activates the student and creates the approved guardian link', async () => {
      const { studentId, token, code } = await selfRegisterAndCollect();

      const result = await service.approve(token, parent.id, { otp: code });

      expect(result.studentId).toBe(studentId);
      expect(repo.profileStatus(studentId)).toBe('active');
      expect(repo.approvedLinksFor(studentId)).toHaveLength(1);
      expect(repo.requestForStudent(studentId)?.status).toBe('approved');
    });

    it('rejects a wrong OTP, counts the attempt, and leaves the student inert', async () => {
      const { studentId, token, code } = await selfRegisterAndCollect();

      await expect(
        service.approve(token, parent.id, { otp: wrongCode(code) }),
      ).rejects.toMatchObject({ statusCode: 401, code: 'invalid_otp' });

      expect(repo.profileStatus(studentId)).toBe('pending_approval');
      expect(repo.otpAttempts(studentId)).toBe(1);

      // The correct code still works afterwards (attempt under the limit).
      await service.approve(token, parent.id, { otp: code });
      expect(repo.profileStatus(studentId)).toBe('active');
    });

    it('forbids approval by a parent whose phone does not match the request', async () => {
      const { token, code } = await selfRegisterAndCollect();
      const otherParent = await users.createParent({
        fullName: 'Someone Else',
        email: 'other@example.com',
        phone: '01111111111',
        passwordHash: 'x',
        localePreference: 'ar',
      });

      await expect(
        service.approve(token, otherParent.id, { otp: code }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'phone_mismatch' });
    });

    it('reject marks the request rejected and keeps the student inert', async () => {
      const { studentId, token } = await selfRegisterAndCollect();

      await service.reject(token, parent.id);

      expect(repo.requestForStudent(studentId)?.status).toBe('rejected');
      expect(repo.profileStatus(studentId)).toBe('pending_approval');
      expect(repo.approvedLinksFor(studentId)).toHaveLength(0);
    });

    it('cannot approve a request that was already resolved', async () => {
      const { token, code } = await selfRegisterAndCollect();
      await service.approve(token, parent.id, { otp: code });

      await expect(service.approve(token, parent.id, { otp: code })).rejects.toMatchObject({
        statusCode: 409,
        code: 'already_resolved',
      });
    });

    it('rejects approval of an expired request', async () => {
      const { studentId, token, code } = await selfRegisterAndCollect();
      repo.expireRequest(studentId);

      await expect(service.approve(token, parent.id, { otp: code })).rejects.toMatchObject({
        code: 'request_expired',
      });
    });
  });
});
