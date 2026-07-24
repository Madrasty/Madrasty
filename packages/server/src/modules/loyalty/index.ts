import { CouponService } from './coupon.service';
import { DrizzleLoyaltyRepository } from './loyalty.repository';
import { LoyaltyService } from './loyalty.service';
import { PointsService } from './points.service';

// Composition helper: assembles the loyalty service from its repository +
// sub-services. Shared by the payments module (checkout/settlement) and the
// loyalty router.
export function buildLoyaltyService(): LoyaltyService {
  const repo = new DrizzleLoyaltyRepository();
  return new LoyaltyService(repo, new CouponService(repo), new PointsService(repo));
}
