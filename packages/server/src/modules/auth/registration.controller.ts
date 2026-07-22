import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { RegistrationService } from './registration.service';
import {
  addStudentSchema,
  approveSchema,
  studentSelfRegisterSchema,
} from './registration.schemas';

// Factory over a RegistrationService instance so the app wires Postgres+SMS while
// tests inject in-memory fakes.
export function createRegistrationController(service: RegistrationService) {
  // Feature 5 — authenticated parent adds a student. requireAuth+requireRole set
  // req.user, so the parent id is trusted server-side (never taken from the body).
  const addStudent = asyncHandler(async (req: Request, res: Response) => {
    const input = addStudentSchema.parse(req.body);
    const result = await service.addStudent(req.user!.id, input);
    res.status(201).json(result);
  });

  // Feature 6 — public student self-registration. Response never leaks the token.
  const selfRegister = asyncHandler(async (req: Request, res: Response) => {
    const input = studentSelfRegisterSchema.parse(req.body);
    const result = await service.selfRegister(input);
    res.status(201).json(result);
  });

  // Feature 7 — parent opens the SMS link.
  const getApproval = asyncHandler(async (req: Request, res: Response) => {
    const view = await service.getApprovalRequest(req.params.token);
    res.status(200).json(view);
  });

  const approve = asyncHandler(async (req: Request, res: Response) => {
    const input = approveSchema.parse(req.body);
    const result = await service.approve(req.params.token, req.user!.id, input);
    res.status(200).json({ ...result, status: 'approved' });
  });

  const reject = asyncHandler(async (req: Request, res: Response) => {
    await service.reject(req.params.token, req.user!.id);
    res.status(200).json({ status: 'rejected' });
  });

  return { addStudent, selfRegister, getApproval, approve, reject };
}
