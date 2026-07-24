import type {
  AdjustPointsRequest,
  CheckoutQuoteRequest,
  CheckoutQuoteResult,
  CouponDiscountType,
  CouponView,
  CreateCouponRequest,
  LoyaltySummary,
} from '@madrasty/shared';
import { COUPON_DISCOUNT_TYPES } from '@madrasty/shared';
import type { Database } from '../../db/client';
import { HttpError } from '../../lib/http-error';
import { CouponService } from './coupon.service';
import type { CouponWithCount, LoyaltyRepository } from './loyalty.repository';
import { PointsService } from './points.service';
import { computeBreakdown, type AppliedCoupon } from './pricing';
import { evaluateEarn } from './rules-engine/index';

interface QuoteActor {
  id: string;
}

function toCouponView(c: CouponWithCount): CouponView {
  return {
    id: c.id,
    code: c.code,
    discountType: c.discountType as CouponDiscountType,
    discountValue: c.discountValue,
    usageLimit: c.usageLimit,
    usageLimitPerUser: c.usageLimitPerUser,
    validFrom: c.validFrom.toISOString(),
    validUntil: c.validUntil ? c.validUntil.toISOString() : null,
    applicableTo: c.applicableTo,
    timesRedeemed: c.timesRedeemed,
    active: c.deletedAt == null,
    createdAt: c.createdAt.toISOString(),
  };
}

export interface QuoteInput {
  userId: string;
  programId: string;
  amountEgp: number; // list price (server-authoritative)
  couponCode?: string;
  redeemPoints?: number;
}

export interface QuoteResult extends CheckoutQuoteResult {
  couponId: string | null; // internal: persisted into the transaction for settlement
}

// The minimal shape settlement needs — matches the payments TransactionRecord
// structurally, so loyalty doesn't import the payments module.
export interface SettledTransaction {
  id: string;
  userId: string;
  purchasableId: string;
  purchasableType: string;
  amountEgp: string;
  metadata: Record<string, unknown>;
}

// What checkout stores on the transaction so settlement can finalize loyalty
// effects idempotently (points are only moved once the payment actually succeeds).
export interface LoyaltyIntent {
  couponId: string | null;
  couponCode: string | null;
  couponBonusPoints: number;
  pointsRedeemed: number;
}

// Orchestrates the loyalty pricing + settlement. Pure math lives in pricing.ts and
// rules-engine; this class wires it to the DB and to the payment lifecycle.
export class LoyaltyService {
  constructor(
    private readonly repo: LoyaltyRepository,
    private readonly coupons: CouponService,
    private readonly points: PointsService,
  ) {}

  getSummary(userId: string, locale: string): Promise<LoyaltySummary> {
    return this.points.getSummary(userId, locale);
  }

  // Price a prospective order. Used by the quote endpoint AND by checkout, so the
  // number the user previewed is exactly the number they are charged.
  async quote(input: QuoteInput): Promise<QuoteResult> {
    const now = new Date();
    const [subjectId, balance, config, earnRules] = await Promise.all([
      this.repo.getProgramSubjectId(input.programId),
      this.repo.getBalance(input.userId),
      this.repo.getPointsConfig(),
      this.repo.getActiveEarnRules('purchase', now),
    ]);

    let applied: AppliedCoupon | null = null;
    let couponId: string | null = null;
    let couponValid = false;
    let couponError: string | null = null;

    if (input.couponCode && input.couponCode.trim()) {
      const evaluation = await this.coupons.evaluate(input.couponCode, {
        userId: input.userId,
        programId: input.programId,
        subjectId,
        amountEgp: input.amountEgp,
      });
      if (evaluation.valid) {
        couponValid = true;
        couponId = evaluation.coupon.id;
        applied = {
          code: evaluation.coupon.code,
          discountType: evaluation.coupon.discountType as CouponDiscountType,
          discountEgp: evaluation.discountEgp,
          bonusPoints: evaluation.bonusPoints,
        };
      } else {
        couponError = evaluation.error;
      }
    }

    const breakdown = computeBreakdown({
      amountEgp: input.amountEgp,
      coupon: applied,
      requestedRedeemPoints: input.redeemPoints ?? 0,
      balance,
      config,
      earnRules,
      subjectId,
      programId: input.programId,
    });

    return { ...breakdown, couponValid, couponError, couponId };
  }

  // Quote endpoint: resolve the program's list price server-side (never trusted
  // from the client), then price the order. Only 'learning_program' is purchasable.
  async quoteForProgram(actor: QuoteActor, req: CheckoutQuoteRequest): Promise<CheckoutQuoteResult> {
    if (req.purchasableType !== 'learning_program') {
      throw HttpError.badRequest('unsupported_purchasable', 'Only learning programs can be quoted.');
    }
    const program = await this.repo.getProgramPurchaseInfo(req.purchasableId);
    if (!program) throw HttpError.notFound('program_not_found', 'Program not found.');
    if (program.status !== 'published') {
      throw HttpError.badRequest('program_not_purchasable', 'This program is not for sale.');
    }
    const listPrice = Number(program.priceEgp ?? 0);
    if (!listPrice || listPrice <= 0) {
      throw HttpError.badRequest('program_is_free', 'This program is free — no payment is required.');
    }
    const quote = await this.quote({
      userId: actor.id,
      programId: req.purchasableId,
      amountEgp: listPrice,
      couponCode: req.couponCode,
      redeemPoints: req.redeemPoints,
    });
    const { couponId: _internal, ...result } = quote;
    return result;
  }

  // --- Admin: coupon management + manual points adjustment (doc 05 §4) ---

  async createCoupon(actorId: string, req: CreateCouponRequest): Promise<CouponView> {
    const code = CouponService.normalizeCode(req.code);
    if (!code) throw HttpError.badRequest('coupon_code_required', 'A coupon code is required.');
    if (!COUPON_DISCOUNT_TYPES.includes(req.discountType)) {
      throw HttpError.badRequest('invalid_discount_type', 'Unknown discount type.');
    }
    // Value bounds depend on type: a percentage is 0–100; others are positive.
    if (req.discountType === 'percentage') {
      if (req.discountValue <= 0 || req.discountValue > 100) {
        throw HttpError.badRequest('invalid_discount_value', 'Percentage must be between 0 and 100.');
      }
    } else if (req.discountValue <= 0) {
      throw HttpError.badRequest('invalid_discount_value', 'Discount value must be positive.');
    }
    if (await this.repo.findCouponByCode(code)) {
      throw HttpError.conflict('coupon_code_taken', 'A coupon with this code already exists.');
    }

    const applicableTo: Record<string, unknown> = {};
    if (req.applicableTo?.programs?.length) applicableTo.programs = req.applicableTo.programs;
    if (req.applicableTo?.subjects?.length) applicableTo.subjects = req.applicableTo.subjects;
    if (typeof req.applicableTo?.minAmount === 'number') {
      applicableTo.min_amount = req.applicableTo.minAmount;
    }

    const created = await this.repo.createCoupon({
      code,
      discountType: req.discountType,
      discountValue: String(req.discountValue),
      usageLimit: req.usageLimit ?? null,
      usageLimitPerUser: req.usageLimitPerUser ?? 1,
      validFrom: req.validFrom ? new Date(req.validFrom) : new Date(),
      validUntil: req.validUntil ? new Date(req.validUntil) : null,
      applicableTo,
    });
    await this.repo.writeAudit({
      actorId,
      action: 'coupon.create',
      targetType: 'coupon',
      targetId: created.id,
      metadata: { code: created.code, discountType: created.discountType },
    });
    return toCouponView({ ...created, timesRedeemed: 0 });
  }

  async listCoupons(): Promise<CouponView[]> {
    const rows = await this.repo.listCouponsWithCounts();
    return rows.map(toCouponView);
  }

  async deleteCoupon(actorId: string, id: string): Promise<void> {
    const ok = await this.repo.softDeleteCoupon(id);
    if (!ok) throw HttpError.notFound('coupon_not_found', 'Coupon not found.');
    await this.repo.writeAudit({
      actorId,
      action: 'coupon.delete',
      targetType: 'coupon',
      targetId: id,
    });
  }

  // Manual points correction: append a ledger row + an audit entry (reason is
  // mandatory). Returns the resulting balance for the admin UI.
  async adjustPoints(actorId: string, req: AdjustPointsRequest): Promise<{ balance: number }> {
    if (!req.reason || !req.reason.trim()) {
      throw HttpError.badRequest('reason_required', 'A reason is required for a points adjustment.');
    }
    if (!Number.isInteger(req.delta) || req.delta === 0) {
      throw HttpError.badRequest('invalid_delta', 'Adjustment must be a non-zero whole number.');
    }
    const balance = await this.points.adjustPoints({
      userId: req.userId,
      delta: req.delta,
      note: req.reason.trim(),
      actorId,
    });
    await this.repo.writeAudit({
      actorId,
      action: 'points.adjust',
      targetType: 'user',
      targetId: req.userId,
      metadata: { delta: req.delta, reason: req.reason.trim() },
    });
    return { balance };
  }

  // Build the intent blob checkout persists on the transaction from a quote.
  static intentFromQuote(quote: QuoteResult): LoyaltyIntent {
    return {
      couponId: quote.couponId,
      couponCode: quote.coupon?.code ?? null,
      couponBonusPoints: quote.couponBonusPoints,
      pointsRedeemed: quote.pointsRedeemed,
    };
  }

  // Apply loyalty effects for a settled payment (doc 05 §1, §4). Runs INSIDE the
  // settlement DB transaction (via `db`) so points/coupon writes commit atomically
  // with access being granted, and — because settlement runs exactly once per
  // transaction — every effect here is applied exactly once.
  async finalizeForTransaction(db: Database, txn: SettledTransaction): Promise<void> {
    if (txn.purchasableType !== 'learning_program') return;
    const bound = this.repo.withDb(db);
    const intent = (txn.metadata?.loyalty ?? {}) as Partial<LoyaltyIntent>;
    const now = new Date();

    // 1. Spend redeemed points (clamped to the live balance — guards the rare race
    // where the buyer spent those points elsewhere between checkout and payment).
    const requestedRedeem = Math.floor(intent.pointsRedeemed ?? 0);
    if (requestedRedeem > 0) {
      const balance = await bound.getBalance(txn.userId);
      const actual = Math.min(requestedRedeem, balance);
      if (actual > 0) {
        await bound.insertLedger({
          userId: txn.userId,
          delta: -actual,
          reason: 'redeem_reward',
          relatedTransactionId: txn.id,
          metadata: { requested: requestedRedeem },
        });
      }
    }

    // 2. Record coupon usage; award free_points bonus if applicable.
    if (intent.couponId) {
      await bound.insertCouponRedemption({
        couponId: intent.couponId,
        userId: txn.userId,
        transactionId: txn.id,
      });
      const bonus = Math.floor(intent.couponBonusPoints ?? 0);
      if (bonus > 0) {
        await bound.insertLedger({
          userId: txn.userId,
          delta: bonus,
          reason: 'coupon_bonus',
          relatedTransactionId: txn.id,
          metadata: { couponCode: intent.couponCode ?? null },
        });
      }
    }

    // 3. Earn points on the amount actually paid (data-driven rules engine).
    const [rules, subjectId] = await Promise.all([
      bound.getActiveEarnRules('purchase', now),
      bound.getProgramSubjectId(txn.purchasableId),
    ]);
    const earn = evaluateEarn(rules, {
      trigger: 'purchase',
      amountEgp: Number(txn.amountEgp),
      subjectId,
      programId: txn.purchasableId,
    });
    if (earn.points > 0) {
      await bound.insertLedger({
        userId: txn.userId,
        delta: earn.points,
        reason: 'purchase',
        relatedTransactionId: txn.id,
        metadata: { ruleId: earn.ruleId },
      });
    }
  }
}
