import { z } from 'zod';
import { COUPON_DISCOUNT_TYPES, PURCHASABLE_TYPES } from '@madrasty/shared';

// Preview discounts without charging. No amount field — the price is resolved
// server-side from the program (doc 04 §3, doc 05 §4).
export const quoteRequestSchema = z.object({
  purchasableType: z.enum(PURCHASABLE_TYPES),
  purchasableId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  couponCode: z.string().min(1).max(64).optional(),
  redeemPoints: z.number().int().positive().optional(),
});

// Admin: create a coupon. Date fields are lenient ISO strings (parsed with Date).
export const createCouponSchema = z.object({
  code: z.string().min(1).max(64),
  discountType: z.enum(COUPON_DISCOUNT_TYPES),
  discountValue: z.number().positive(),
  usageLimit: z.number().int().positive().nullable().optional(),
  usageLimitPerUser: z.number().int().positive().optional(),
  validFrom: z.string().min(1).optional(),
  validUntil: z.string().min(1).nullable().optional(),
  applicableTo: z
    .object({
      programs: z.array(z.string().uuid()).optional(),
      subjects: z.array(z.string().uuid()).optional(),
      minAmount: z.number().nonnegative().optional(),
    })
    .optional(),
});

// Admin: manual points correction (reason mandatory — doc 05 §4).
export const adjustPointsSchema = z.object({
  userId: z.string().uuid(),
  delta: z.number().int(),
  reason: z.string().min(1).max(500),
});
