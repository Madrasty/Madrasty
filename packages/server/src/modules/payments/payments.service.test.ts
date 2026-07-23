import { beforeEach, describe, expect, it } from 'vitest';
import { CheckoutService, type CheckoutActor } from './checkout.service';
import { WebhookService } from './webhook.service';
import { MockProvider, signMockWebhook } from './providers/mock.provider';
import type { PaymentProvider } from './payment.provider';
import type {
  CreateTransactionInput,
  PaymentsRepository,
  ProgramForPurchase,
  TransactionRecord,
} from './payments.repository';
import type { PaymentProviderName } from '@madrasty/shared';

// In-memory fake of the payments repository — mirrors the Drizzle version's
// idempotency semantics (settle only once, grant only if not already enrolled).
class FakeRepo implements PaymentsRepository {
  programs = new Map<string, ProgramForPurchase>();
  activeStudents = new Set<string>();
  approvedChildren = new Set<string>(); // `${parentId}:${studentId}`
  txns: TransactionRecord[] = [];
  enrollments: Array<{ studentId: string; programId: string; source: string }> = [];
  private seq = 0;

  async getPublishablyPurchasableProgram(id: string) {
    return this.programs.get(id) ?? null;
  }
  async isActiveStudent(id: string) {
    return this.activeStudents.has(id);
  }
  async isApprovedChild(parentId: string, studentId: string) {
    return this.approvedChildren.has(`${parentId}:${studentId}`);
  }
  async hasActiveEnrollment(studentId: string, programId: string) {
    return this.enrollments.some((e) => e.studentId === studentId && e.programId === programId);
  }
  async createPending(input: CreateTransactionInput): Promise<TransactionRecord> {
    const txn: TransactionRecord = {
      id: `txn-${++this.seq}`,
      userId: input.userId,
      beneficiaryId: input.beneficiaryId,
      purchasableType: input.purchasableType,
      purchasableId: input.purchasableId,
      amountEgp: input.amountEgp,
      currency: input.currency,
      paymentProvider: input.provider,
      providerReference: null,
      status: 'pending',
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.txns.push(txn);
    return txn;
  }
  async attachProviderReference(id: string, ref: string | null, merge: Record<string, unknown>) {
    const txn = this.txns.find((t) => t.id === id)!;
    txn.providerReference = ref;
    txn.metadata = { ...txn.metadata, ...merge };
  }
  async findByProviderReference(provider: PaymentProviderName, ref: string) {
    return (
      this.txns.find((t) => t.paymentProvider === provider && t.providerReference === ref) ?? null
    );
  }
  async getByIdForUser(id: string, userId: string) {
    return this.txns.find((t) => t.id === id && t.userId === userId) ?? null;
  }
  async settlePaidAndGrant(id: string, programId: string, studentId: string, raw: unknown) {
    const txn = this.txns.find((t) => t.id === id)!;
    if (txn.status === 'paid') return false;
    txn.status = 'paid';
    txn.metadata = { ...txn.metadata, webhook: raw };
    if (!(await this.hasActiveEnrollment(studentId, programId))) {
      this.enrollments.push({ studentId, programId, source: 'purchase' });
    }
    return true;
  }
  async markFailed(id: string, raw: unknown) {
    const txn = this.txns.find((t) => t.id === id)!;
    if (txn.status === 'paid') return;
    txn.status = 'failed';
    txn.metadata = { ...txn.metadata, webhook: raw };
  }
}

const PROGRAM_ID = '11111111-1111-1111-1111-111111111111';
const student: CheckoutActor = { id: 'student-1', role: 'student' };
const parent: CheckoutActor = { id: 'parent-1', role: 'parent' };

describe('payments', () => {
  let repo: FakeRepo;
  let registry: Map<PaymentProviderName, PaymentProvider>;
  let checkout: CheckoutService;
  let webhook: WebhookService;

  beforeEach(() => {
    repo = new FakeRepo();
    repo.programs.set(PROGRAM_ID, {
      id: PROGRAM_ID,
      teacherId: 'teacher-1',
      status: 'published',
      priceEgp: '150.00',
    });
    registry = new Map<PaymentProviderName, PaymentProvider>([['mock', new MockProvider()]]);
    checkout = new CheckoutService(repo, registry);
    webhook = new WebhookService(repo, registry);
  });

  function req(overrides: Partial<Parameters<CheckoutService['checkout']>[1]> = {}) {
    return {
      purchasableType: 'learning_program' as const,
      purchasableId: PROGRAM_ID,
      provider: 'mock' as const,
      ...overrides,
    };
  }

  describe('checkout — price is server-authoritative', () => {
    it('creates a pending transaction at the server price and returns provider init', async () => {
      const result = await checkout.checkout(student, req());
      expect(result.status).toBe('pending');
      expect(result.amountEgp).toBe('150.00'); // from the program, not the client
      expect(result.providerReference).toBe('mock_txn-1');
      expect(repo.txns).toHaveLength(1);
      expect(repo.txns[0].beneficiaryId).toBe(student.id);
      // No access is granted at checkout.
      expect(repo.enrollments).toHaveLength(0);
    });

    it('rejects a free program', async () => {
      repo.programs.get(PROGRAM_ID)!.priceEgp = '0';
      await expect(checkout.checkout(student, req())).rejects.toMatchObject({
        code: 'program_is_free',
      });
    });

    it('rejects an unpublished program', async () => {
      repo.programs.get(PROGRAM_ID)!.status = 'draft';
      await expect(checkout.checkout(student, req())).rejects.toMatchObject({
        code: 'program_not_purchasable',
      });
    });

    it('rejects a second purchase when already enrolled', async () => {
      repo.enrollments.push({ studentId: student.id, programId: PROGRAM_ID, source: 'purchase' });
      await expect(checkout.checkout(student, req())).rejects.toMatchObject({
        statusCode: 409,
        code: 'already_enrolled',
      });
    });
  });

  describe('checkout — beneficiary guards (doc 11)', () => {
    it('forbids a student purchasing for someone else', async () => {
      await expect(
        checkout.checkout(student, req({ studentId: 'student-2' })),
      ).rejects.toMatchObject({ statusCode: 403, code: 'not_your_purchase' });
    });

    it('lets a parent buy for an approved, active child', async () => {
      repo.approvedChildren.add(`${parent.id}:child-1`);
      repo.activeStudents.add('child-1');
      const result = await checkout.checkout(parent, req({ studentId: 'child-1' }));
      expect(result.status).toBe('pending');
      expect(repo.txns[0].beneficiaryId).toBe('child-1');
    });

    it('forbids a parent buying for a non-child', async () => {
      repo.activeStudents.add('child-1');
      await expect(
        checkout.checkout(parent, req({ studentId: 'child-1' })),
      ).rejects.toMatchObject({ statusCode: 403, code: 'not_your_child' });
    });

    it('forbids a parent buying for an approved-but-inactive child', async () => {
      repo.approvedChildren.add(`${parent.id}:child-1`);
      await expect(
        checkout.checkout(parent, req({ studentId: 'child-1' })),
      ).rejects.toMatchObject({ statusCode: 403, code: 'student_not_active' });
    });

    it('requires a parent to name the child', async () => {
      await expect(checkout.checkout(parent, req())).rejects.toMatchObject({
        code: 'student_required',
      });
    });
  });

  describe('webhook — verify, settle, idempotency', () => {
    async function pay() {
      const result = await checkout.checkout(student, req());
      const body = { obj: { providerReference: result.providerReference!, success: true } };
      return { body, signature: signMockWebhook(body), result };
    }

    it('grants access on a signed success webhook, exactly once when replayed', async () => {
      const { body, signature } = await pay();

      expect(await webhook.handle('mock', body, signature)).toBe('settled');
      expect(repo.txns[0].status).toBe('paid');
      expect(repo.enrollments).toEqual([
        { studentId: student.id, programId: PROGRAM_ID, source: 'purchase' },
      ]);

      // Replay: no second grant.
      expect(await webhook.handle('mock', body, signature)).toBe('already_settled');
      expect(repo.enrollments).toHaveLength(1);
    });

    it('rejects a webhook with a bad signature and grants nothing', async () => {
      const { body } = await pay();
      await expect(webhook.handle('mock', body, 'not-a-real-signature')).rejects.toMatchObject({
        statusCode: 401,
        code: 'invalid_signature',
      });
      expect(repo.txns[0].status).toBe('pending');
      expect(repo.enrollments).toHaveLength(0);
    });

    it('rejects a tampered amount/success flag (signature no longer matches)', async () => {
      const { body, signature } = await pay();
      const tampered = { obj: { ...body.obj, success: false } };
      await expect(webhook.handle('mock', tampered, signature)).rejects.toMatchObject({
        code: 'invalid_signature',
      });
    });

    it('marks a signed failure without granting access', async () => {
      const result = await checkout.checkout(student, req());
      const body = { obj: { providerReference: result.providerReference!, success: false } };
      expect(await webhook.handle('mock', body, signMockWebhook(body))).toBe('failed');
      expect(repo.txns[0].status).toBe('failed');
      expect(repo.enrollments).toHaveLength(0);
    });

    it('acknowledges an unmatched reference without effect', async () => {
      const body = { obj: { providerReference: 'mock_unknown', success: true } };
      expect(await webhook.handle('mock', body, signMockWebhook(body))).toBe('unmatched');
      expect(repo.enrollments).toHaveLength(0);
    });
  });
});
