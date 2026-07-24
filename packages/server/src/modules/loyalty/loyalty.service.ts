import type { CheckoutQuoteResult, CouponDiscountType, LoyaltySummary } from '@madrasty/shared';
import type { Database } from '../../db/client';
import { CouponService } from './coupon.service';
import type { LoyaltyRepository } from './loyalty.repository';
import { PointsService } from './points.service';
import { computeBreakdown, type AppliedCoupon } from './pricing';
import { evaluateEarn } from './rules-engine/index';

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
