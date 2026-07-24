import type { CouponRecord, LoyaltyRepository } from './loyalty.repository';

// What a coupon is being applied against. `amountEgp` is the server-authoritative
// price (already list price — coupon applies before points, doc 05 §4).
export interface CouponContext {
  userId: string;
  programId: string;
  subjectId: string | null;
  amountEgp: number;
}

// Evaluation result. On failure, `error` is an i18n code the client maps to a
// message (e.g. 'coupon_expired'); the coupon is simply ignored, never fatal.
export type CouponEvaluation =
  | { valid: true; coupon: CouponRecord; discountEgp: number; bonusPoints: number }
  | { valid: false; error: string };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function readApplicable(applicableTo: Record<string, unknown>) {
  const programs = Array.isArray(applicableTo.programs)
    ? (applicableTo.programs as string[])
    : undefined;
  const subjects = Array.isArray(applicableTo.subjects)
    ? (applicableTo.subjects as string[])
    : undefined;
  // Accept both min_amount (doc 03 example) and minAmount (DTO camelCase).
  const rawMin = applicableTo.min_amount ?? applicableTo.minAmount;
  const minAmount = typeof rawMin === 'number' ? rawMin : undefined;
  return { programs, subjects, minAmount };
}

// Validates a coupon against a cart and computes its effect (doc 05 §2). All
// checks are server-side; a client-computed discount is never trusted.
export class CouponService {
  constructor(private readonly repo: LoyaltyRepository) {}

  // Normalize codes so 'ramadan20' and 'RAMADAN20' are the same coupon.
  static normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  async evaluate(code: string, ctx: CouponContext): Promise<CouponEvaluation> {
    const coupon = await this.repo.findCouponByCode(CouponService.normalizeCode(code));
    if (!coupon) return { valid: false, error: 'coupon_not_found' };

    const now = new Date();
    if (coupon.validFrom.getTime() > now.getTime()) {
      return { valid: false, error: 'coupon_not_active' };
    }
    if (coupon.validUntil && coupon.validUntil.getTime() <= now.getTime()) {
      return { valid: false, error: 'coupon_expired' };
    }

    // Global + per-user usage limits (counted from coupon_redemptions).
    if (coupon.usageLimit != null) {
      const total = await this.repo.countCouponRedemptions(coupon.id);
      if (total >= coupon.usageLimit) return { valid: false, error: 'coupon_usage_exceeded' };
    }
    const perUser = await this.repo.countCouponRedemptionsForUser(coupon.id, ctx.userId);
    if (perUser >= coupon.usageLimitPerUser) {
      return { valid: false, error: 'coupon_user_limit' };
    }

    // applicable_to gating (program / subject / minimum spend).
    const { programs, subjects, minAmount } = readApplicable(coupon.applicableTo);
    if (programs && programs.length > 0 && !programs.includes(ctx.programId)) {
      return { valid: false, error: 'coupon_not_applicable' };
    }
    if (subjects && subjects.length > 0 && (!ctx.subjectId || !subjects.includes(ctx.subjectId))) {
      return { valid: false, error: 'coupon_not_applicable' };
    }
    if (typeof minAmount === 'number' && ctx.amountEgp < minAmount) {
      return { valid: false, error: 'coupon_min_amount' };
    }

    return { valid: true, coupon, ...this.computeEffect(coupon, ctx.amountEgp) };
  }

  // Discount / bonus for a validated coupon. Discount can never exceed the price.
  private computeEffect(
    coupon: CouponRecord,
    amountEgp: number,
  ): { discountEgp: number; bonusPoints: number } {
    const value = Number(coupon.discountValue);
    switch (coupon.discountType) {
      case 'percentage':
        return { discountEgp: round2(Math.min(amountEgp, (amountEgp * value) / 100)), bonusPoints: 0 };
      case 'fixed_amount':
        return { discountEgp: round2(Math.min(amountEgp, value)), bonusPoints: 0 };
      case 'free_points':
        // No price change; grants bonus points on a completed purchase.
        return { discountEgp: 0, bonusPoints: Math.max(0, Math.floor(value)) };
      default:
        return { discountEgp: 0, bonusPoints: 0 };
    }
  }
}
