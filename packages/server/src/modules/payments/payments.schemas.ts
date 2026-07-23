import { z } from 'zod';
import { PAYMENT_PROVIDERS, PURCHASABLE_TYPES } from '@madrasty/shared';

// Note there is deliberately NO price/amount field: the client says what to buy,
// the server computes the amount (doc 04 §3). `mock` is accepted for dev/test but
// the provider registry only exposes it outside production.
export const checkoutRequestSchema = z.object({
  purchasableType: z.enum(PURCHASABLE_TYPES),
  purchasableId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  provider: z.enum(PAYMENT_PROVIDERS),
  couponCode: z.string().min(1).max(64).optional(),
});
