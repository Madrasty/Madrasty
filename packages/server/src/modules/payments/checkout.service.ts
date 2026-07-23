import type { CheckoutRequest, CheckoutResult, PaymentProviderName } from '@madrasty/shared';
import { HttpError } from '../../lib/http-error';
import { ProviderNotConfiguredError, type PaymentProvider } from './payment.provider';
import { getProvider } from './providers/registry';
import type { PaymentsRepository } from './payments.repository';

export interface CheckoutActor {
  id: string;
  role: string;
}

// Server-side checkout (doc 04 §3). The client says WHAT to buy and for WHOM; the
// amount is recalculated here from our own records — a client-sent price is never
// trusted. Access is NOT granted here; only a verified webhook grants it (§7).
export class CheckoutService {
  constructor(
    private readonly repo: PaymentsRepository,
    private readonly registry: Map<PaymentProviderName, PaymentProvider>,
  ) {}

  async checkout(actor: CheckoutActor, req: CheckoutRequest): Promise<CheckoutResult> {
    if (req.purchasableType !== 'learning_program') {
      throw HttpError.badRequest(
        'unsupported_purchasable',
        'Only learning programs can be purchased right now.',
      );
    }

    const provider = getProvider(this.registry, req.provider);
    const studentId = await this.resolveBeneficiary(actor, req.studentId);

    const program = await this.repo.getPublishablyPurchasableProgram(req.purchasableId);
    if (!program) {
      throw HttpError.notFound('program_not_found', 'Program not found.');
    }
    if (program.status !== 'published') {
      throw HttpError.badRequest('program_not_purchasable', 'This program is not for sale.');
    }

    // Price is authoritative from the server (doc 04 §3, §5 — EGP source of truth).
    const amountEgp = program.priceEgp;
    if (!amountEgp || Number(amountEgp) <= 0) {
      throw HttpError.badRequest(
        'program_is_free',
        'This program is free — no payment is required.',
      );
    }

    // TODO(doc 05): apply couponCode + points redemption before creating the
    // transaction. Until the loyalty module lands, checkout charges list price.

    const now = new Date();
    if (await this.repo.hasActiveEnrollment(studentId, program.id, now)) {
      throw HttpError.conflict('already_enrolled', 'This student already has access.');
    }

    const txn = await this.repo.createPending({
      userId: actor.id,
      beneficiaryId: studentId,
      purchasableType: 'learning_program',
      purchasableId: program.id,
      amountEgp,
      currency: 'EGP',
      provider: req.provider,
      metadata: { couponCode: req.couponCode ?? null },
    });

    let init;
    try {
      init = await provider.createPayment({
        transactionId: txn.id,
        amountEgp,
        currency: 'EGP',
        description: `Program ${program.id}`,
      });
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        throw new HttpError(503, 'provider_unavailable', 'Payment provider is not available.');
      }
      throw err;
    }

    await this.repo.attachProviderReference(txn.id, init.providerReference, {
      redirectUrl: init.redirectUrl,
      providerRaw: init.raw ?? null,
    });

    return {
      transactionId: txn.id,
      status: 'pending',
      amountEgp,
      provider: req.provider,
      redirectUrl: init.redirectUrl,
      providerReference: init.providerReference,
    };
  }

  // Who gets access. A student buys for themselves; a parent may buy for an
  // approved, active child (doc 01 §7, doc 11 — a minor is never self-sufficient).
  private async resolveBeneficiary(
    actor: CheckoutActor,
    requestedStudentId: string | undefined,
  ): Promise<string> {
    if (actor.role === 'student') {
      if (requestedStudentId && requestedStudentId !== actor.id) {
        throw HttpError.forbidden('not_your_purchase', 'A student can only purchase for themselves.');
      }
      return actor.id;
    }

    if (actor.role === 'parent') {
      if (!requestedStudentId) {
        throw HttpError.badRequest('student_required', 'Choose which child this purchase is for.');
      }
      const [approved, active] = await Promise.all([
        this.repo.isApprovedChild(actor.id, requestedStudentId),
        this.repo.isActiveStudent(requestedStudentId),
      ]);
      if (!approved) {
        throw HttpError.forbidden('not_your_child', 'This student is not an approved child.');
      }
      if (!active) {
        throw HttpError.forbidden('student_not_active', 'This student profile is not active.');
      }
      return requestedStudentId;
    }

    throw HttpError.forbidden('cannot_purchase', 'This account type cannot make purchases.');
  }
}
