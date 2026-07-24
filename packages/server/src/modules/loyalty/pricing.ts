import type { CouponDiscountType, PriceBreakdown } from '@madrasty/shared';
import { evaluateEarn, type EarnRuleInput } from './rules-engine/index';
import type { PointsConfigRecord } from './loyalty.repository';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function egp(n: number): string {
  return round2(Math.max(0, n)).toFixed(2);
}

export interface AppliedCoupon {
  code: string;
  discountType: CouponDiscountType;
  discountEgp: number;
  bonusPoints: number;
}

export interface PricingInputs {
  amountEgp: number; // list price (server-authoritative)
  coupon: AppliedCoupon | null; // already-validated coupon effect, or null
  requestedRedeemPoints: number; // points the buyer asked to spend (0 = none)
  balance: number; // buyer's current points balance
  config: PointsConfigRecord;
  earnRules: EarnRuleInput[]; // active 'purchase' rules
  subjectId: string | null;
  programId: string;
}

// Pure pricing (doc 05 §4): original → coupon → points → final, computed entirely
// server-side. Points redemption is clamped to balance, the min-redeem threshold,
// and a max-percent-of-order guardrail so a client can never over-discount.
export function computeBreakdown(inputs: PricingInputs): PriceBreakdown {
  const original = round2(inputs.amountEgp);
  const couponDiscount = inputs.coupon ? Math.min(original, inputs.coupon.discountEgp) : 0;
  const afterCoupon = round2(original - couponDiscount);

  const { redeemPointsPerEgp, minRedeemPoints, maxRedeemPercent } = inputs.config;
  let pointsRedeemed = 0;
  let pointsDiscount = 0;
  if (inputs.requestedRedeemPoints > 0 && redeemPointsPerEgp > 0) {
    // How many points may actually be spent: bounded by balance, by the request,
    // and by the max % of the (post-coupon) order this discount may cover.
    const maxDiscountEgp = round2((afterCoupon * maxRedeemPercent) / 100);
    const maxPointsByAmount = Math.floor(maxDiscountEgp * redeemPointsPerEgp);
    const capped = Math.min(
      Math.floor(inputs.requestedRedeemPoints),
      inputs.balance,
      maxPointsByAmount,
    );
    // Below the minimum threshold, redeeming isn't allowed (doc 05 §1).
    if (capped >= minRedeemPoints) {
      pointsRedeemed = capped;
      pointsDiscount = Math.min(afterCoupon, round2(capped / redeemPointsPerEgp));
    }
  }

  const finalEgp = round2(Math.max(0, afterCoupon - pointsDiscount));

  // Points EARNED accrue on what is actually paid (doc 05 §1) — computed the same
  // way here and at settlement, so the quote never lies about what you'll earn.
  const earn = evaluateEarn(inputs.earnRules, {
    trigger: 'purchase',
    amountEgp: finalEgp,
    subjectId: inputs.subjectId,
    programId: inputs.programId,
  });

  return {
    originalEgp: egp(original),
    couponDiscountEgp: egp(couponDiscount),
    pointsDiscountEgp: egp(pointsDiscount),
    finalEgp: egp(finalEgp),
    pointsRedeemed,
    pointsToEarn: earn.points,
    couponBonusPoints: inputs.coupon?.bonusPoints ?? 0,
    coupon: inputs.coupon
      ? { code: inputs.coupon.code, discountType: inputs.coupon.discountType }
      : null,
  };
}
