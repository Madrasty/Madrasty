import type { CheckoutRequest, CheckoutResult, PaymentProviderName } from '@madrasty/shared';
import { HttpError } from '../../lib/http-error';
import { LoyaltyService, type LoyaltyIntent } from '../loyalty/loyalty.service';
import { ProviderNotConfiguredError, type PaymentProvider } from './payment.provider';
import { getProvider } from './providers/registry';
import type { OnSettled, PaymentsRepository } from './payments.repository';

export interface CheckoutActor {
  id: string;
  role: string;
}

// Server-side checkout (doc 04 §3). The client says WHAT to buy and for WHOM; the
// amount is recalculated here from our own records — a client-sent price is never
// trusted. Coupons and points discounts are applied server-side too (doc 05 §4):
// the client sends only a coupon code / how many points to spend, never a total.
// Access is NOT granted here; only a verified webhook grants it (§7) — except a
// discount that zeroes the total, which is settled server-side (no gateway trip).
export class CheckoutService {
  constructor(
    private readonly repo: PaymentsRepository,
    private readonly registry: Map<PaymentProviderName, PaymentProvider>,
    // Optional so payment-only tests can run without the loyalty module; when
    // absent, checkout charges list price (no coupons/points).
    private readonly loyalty?: LoyaltyService,
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

    const now = new Date();
    if (await this.repo.hasActiveEnrollment(studentId, program.id, now)) {
      throw HttpError.conflict('already_enrolled', 'This student already has access.');
    }

    // Apply coupons + points server-side (doc 05 §4). `amountToCharge` is what we
    // actually bill; the quote is priced from our own records, never the client.
    let amountToCharge = amountEgp;
    let loyaltyIntent: LoyaltyIntent | null = null;
    let breakdownSnapshot: Record<string, unknown> | null = null;
    if (this.loyalty) {
      const quote = await this.loyalty.quote({
        userId: actor.id,
        programId: program.id,
        amountEgp: Number(amountEgp),
        couponCode: req.couponCode,
        redeemPoints: req.redeemPoints,
      });
      // A coupon the buyer explicitly supplied but we rejected must fail loudly —
      // never silently charge full price on a coupon they thought applied.
      if (req.couponCode && req.couponCode.trim() && !quote.couponValid) {
        throw HttpError.badRequest(
          quote.couponError ?? 'coupon_invalid',
          'This coupon can’t be applied to this purchase.',
        );
      }
      amountToCharge = quote.finalEgp;
      loyaltyIntent = LoyaltyService.intentFromQuote(quote);
      const { couponId: _omit, couponValid: _v, couponError: _e, ...snapshot } = quote;
      breakdownSnapshot = snapshot;
    }

    const txn = await this.repo.createPending({
      userId: actor.id,
      beneficiaryId: studentId,
      purchasableType: 'learning_program',
      purchasableId: program.id,
      amountEgp: amountToCharge,
      currency: 'EGP',
      provider: req.provider,
      metadata: {
        couponCode: req.couponCode ?? null,
        ...(loyaltyIntent ? { loyalty: loyaltyIntent } : {}),
        ...(breakdownSnapshot ? { breakdown: breakdownSnapshot } : {}),
      },
    });

    const loyalty = this.loyalty;
    const onSettled: OnSettled | undefined = loyalty
      ? (db, settledTxn) => loyalty.finalizeForTransaction(db, settledTxn)
      : undefined;

    // Discount covered the whole price → settle server-side (no gateway can take a
    // 0 charge). Access is still granted only through settlePaidAndGrant (§7).
    if (Number(amountToCharge) <= 0) {
      const providerReference = `free-${txn.id}`;
      await this.repo.attachProviderReference(txn.id, providerReference, { freeSettlement: true });
      await this.repo.settlePaidAndGrant(
        txn.id,
        program.id,
        studentId,
        { freeSettlement: true },
        onSettled,
      );
      return {
        transactionId: txn.id,
        status: 'paid',
        amountEgp: amountToCharge,
        provider: req.provider,
        redirectUrl: null,
        providerReference,
      };
    }

    let init;
    try {
      init = await provider.createPayment({
        transactionId: txn.id,
        amountEgp: amountToCharge,
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
      amountEgp: amountToCharge,
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
