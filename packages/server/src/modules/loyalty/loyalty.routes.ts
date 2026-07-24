import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { rateLimit } from '../../lib/rate-limit';
import { buildLoyaltyService } from './index';
import { createLoyaltyController } from './loyalty.controller';

// Composition root. Routes (mounted at /api/loyalty):
//   GET    /me                      buyer's points/tier summary (student/parent)
//   POST   /quote                   preview coupon + points discounts, rate-limited
//   POST   /admin/coupons           create a coupon (admin)
//   GET    /admin/coupons           list coupons + redemption counts (admin)
//   DELETE /admin/coupons/:id       disable a coupon (admin)
//   POST   /admin/points-adjustments  manual points correction (admin)
export function createLoyaltyRouter(): Router {
  const loyalty = buildLoyaltyService();
  const c = createLoyaltyController(loyalty);

  const router = Router();
  const admin = [requireAuth, requireRole('admin')] as const;

  router.get('/me', requireAuth, requireRole('student', 'parent'), c.getSummary);
  router.post(
    '/quote',
    requireAuth,
    requireRole('student', 'parent'),
    // Coupon codes are guessable; rate-limit quote so it can't brute-force codes
    // (doc 05 §5).
    rateLimit({ name: 'loyalty-quote', max: 30, windowSeconds: 60 }),
    c.quote,
  );

  router.post('/admin/coupons', ...admin, c.createCoupon);
  router.get('/admin/coupons', ...admin, c.listCoupons);
  router.delete('/admin/coupons/:id', ...admin, c.deleteCoupon);
  router.post('/admin/points-adjustments', ...admin, c.adjustPoints);

  return router;
}
