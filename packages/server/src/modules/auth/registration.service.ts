import { config } from '../../config/index';
import { HttpError } from '../../lib/http-error';
import { normalizePhone } from '../../lib/phone';
import type { UserRepository } from './auth.repository';
import type { RegistrationRepository } from './registration.repository';
import type { SmsSender } from './sms-sender';
import { generateApprovalToken, generateOtpCode, hashOtp, verifyOtp } from './otp';
import type {
  AddStudentInput,
  ApproveInput,
  StudentSelfRegisterInput,
} from './registration.schemas';

export interface AddStudentResult {
  studentId: string;
  name: string;
  grade: string;
  status: 'active';
}

export interface SelfRegisterResult {
  studentId: string;
  status: 'pending_approval';
}

export interface ApprovalView {
  student: { name: string | null; grade: string | null };
  status: string;
  expiresAt: Date | null;
}

export class RegistrationService {
  constructor(
    private readonly repo: RegistrationRepository,
    private readonly users: UserRepository,
    private readonly sms: SmsSender,
  ) {}

  // Feature 5 (Flow A): an authenticated parent adds a student. The student is
  // created active and immediately linked with approved_at set — the guardian is
  // already verified, so no approval round-trip is needed.
  async addStudent(parentId: string, input: AddStudentInput): Promise<AddStudentResult> {
    const { userId } = await this.repo.createStudent({
      fullName: input.name,
      userStatus: 'active',
      gradeLevel: input.grade,
      schoolName: input.school ?? null,
      profileStatus: 'active',
      profileMetadata: { dateOfBirth: input.dateOfBirth, city: input.city ?? null },
    });

    await this.repo.linkParentChild({
      parentId,
      studentId: userId,
      relationship: input.relationship,
      approvedAt: new Date(),
    });

    return { studentId: userId, name: input.name, grade: input.grade, status: 'active' };
  }

  // Feature 6 (Flow B): a student self-registers. We persist a PENDING profile
  // (no content access — no active status, no approved link) plus an approval
  // request, and "send" an OTP to the parent's phone (stubbed to a log for now).
  async selfRegister(input: StudentSelfRegisterInput): Promise<SelfRegisterResult> {
    const { userId } = await this.repo.createStudent({
      fullName: input.name,
      userStatus: 'pending_verification',
      gradeLevel: input.grade,
      schoolName: null,
      profileStatus: 'pending_approval',
      profileMetadata: {},
    });

    // If a parent account already exists for this mobile, pre-link the request.
    const parent = await this.repo.findParentByPhone(input.parentMobile);

    const approvalToken = generateApprovalToken();
    await this.repo.createApprovalRequest({
      pendingStudentName: input.name,
      pendingStudentGrade: input.grade,
      parentMobile: input.parentMobile,
      matchedParentId: parent?.id ?? null,
      studentProfileId: userId,
      approvalToken,
      expiresAt: new Date(Date.now() + config.GUARDIAN_APPROVAL_EXPIRES_IN_HOURS * 3_600_000),
    });

    // OTP delivered to the PARENT's phone; the code is only ever stored hashed.
    const code = generateOtpCode(config.OTP_CODE_LENGTH);
    await this.repo.createOtp({
      userId,
      channel: 'sms',
      codeHash: await hashOtp(code),
      expiresAt: new Date(Date.now() + config.OTP_EXPIRES_IN_MINUTES * 60_000),
    });

    // The parent receives the approval link (token) and the verification code.
    // The self-registering student never sees the token — hence it is NOT in the
    // response body, only in the SMS to the guardian.
    await this.sms.send(
      input.parentMobile,
      `Knouz Learning: your child ${input.name} wants to join. ` +
        `Approve with token ${approvalToken} — verification code: ${code}`,
    );

    return { studentId: userId, status: 'pending_approval' };
  }

  // Feature 7: parent opens the SMS link — returns just enough to review the
  // request. No token, mobile, or internal ids are exposed.
  async getApprovalRequest(token: string): Promise<ApprovalView> {
    const req = await this.repo.findApprovalRequestByToken(token);
    if (!req) {
      throw HttpError.badRequest('approval_request_not_found', 'Unknown approval request.');
    }
    const expired =
      req.status === 'awaiting_parent' && !!req.expiresAt && req.expiresAt.getTime() < Date.now();
    return {
      student: { name: req.pendingStudentName, grade: req.pendingStudentGrade },
      status: expired ? 'expired' : req.status,
      expiresAt: req.expiresAt,
    };
  }

  // Feature 7: parent approves. Requires the OTP delivered to the parent's phone
  // AND that the authenticated parent's phone matches the number the student
  // supplied. On success the student flips to active and the guardian link is
  // created with approved_at set.
  async approve(token: string, parentId: string, input: ApproveInput): Promise<{ studentId: string }> {
    const req = await this.loadPendingRequest(token);
    await this.assertParentOwnsMobile(parentId, req.parentMobile);

    if (!req.studentProfileId) {
      throw HttpError.badRequest('no_student', 'Approval request has no student attached.');
    }

    await this.verifyRequestOtp(req.studentProfileId, input.otp);

    await this.repo.linkParentChild({
      parentId,
      studentId: req.studentProfileId,
      relationship: 'guardian',
      approvedAt: new Date(),
    });
    await this.repo.activateStudent(req.studentProfileId);
    await this.repo.updateApprovalRequest(req.id, {
      status: 'approved',
      matchedParentId: parentId,
      resolvedAt: new Date(),
    });

    return { studentId: req.studentProfileId };
  }

  // Feature 7: parent rejects. The student profile stays inert (pending, no link)
  // so it still has zero content access.
  async reject(token: string, parentId: string): Promise<void> {
    const req = await this.loadPendingRequest(token);
    await this.assertParentOwnsMobile(parentId, req.parentMobile);
    await this.repo.updateApprovalRequest(req.id, {
      status: 'rejected',
      matchedParentId: parentId,
      resolvedAt: new Date(),
    });
  }

  private async loadPendingRequest(token: string) {
    const req = await this.repo.findApprovalRequestByToken(token);
    if (!req) {
      throw HttpError.badRequest('approval_request_not_found', 'Unknown approval request.');
    }
    if (req.status !== 'awaiting_parent') {
      throw HttpError.conflict('already_resolved', 'This request has already been resolved.');
    }
    if (req.expiresAt && req.expiresAt.getTime() < Date.now()) {
      await this.repo.updateApprovalRequest(req.id, { status: 'expired', resolvedAt: new Date() });
      throw HttpError.badRequest('request_expired', 'This approval request has expired.');
    }
    return req;
  }

  private async assertParentOwnsMobile(parentId: string, parentMobile: string | null): Promise<void> {
    const parent = await this.users.findById(parentId);
    if (!parent) {
      throw HttpError.unauthorized('invalid_parent', 'Parent account not found.');
    }
    if (!parentMobile || normalizePhone(parent.phone ?? '') !== normalizePhone(parentMobile)) {
      throw HttpError.forbidden(
        'phone_mismatch',
        'This request was sent to a different guardian phone number.',
      );
    }
  }

  private async verifyRequestOtp(studentUserId: string, code: string): Promise<void> {
    const otp = await this.repo.findLatestActiveOtp(studentUserId, 'sms');
    if (!otp) {
      throw HttpError.badRequest('otp_not_found', 'No pending verification code for this request.');
    }
    if (otp.expiresAt.getTime() < Date.now()) {
      throw HttpError.badRequest('otp_expired', 'The verification code has expired.');
    }
    if (otp.attemptCount >= config.OTP_MAX_ATTEMPTS) {
      throw HttpError.forbidden('otp_locked', 'Too many attempts. Request a new code.');
    }
    const ok = await verifyOtp(code, otp.codeHash);
    if (!ok) {
      await this.repo.incrementOtpAttempts(otp.id);
      throw HttpError.unauthorized('invalid_otp', 'Invalid verification code.');
    }
    await this.repo.markOtpVerified(otp.id);
  }
}
