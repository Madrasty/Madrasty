import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { rateLimit } from '../../lib/rate-limit';
import { DrizzlePaymentsRepository } from './payments.repository';
import { buildProviderRegistry } from './providers/registry';
import { CheckoutService } from './checkout.service';
import { WebhookService } from './webhook.service';
import { createPaymentsController } from './payments.controller';

// Composition root. Routes (mounted at /api/payments):
//   POST   /checkout                 start a purchase (student/parent), rate-limited
//   POST   /webhooks/:provider       gateway callback — signature-verified, public
//   GET    /transactions/:id         owner polls final (webhook-driven) status
export function createPaymentsRouter(): Router {
  const repo = new DrizzlePaymentsRepository();
  const registry = buildProviderRegistry();
  const c = createPaymentsController({
    checkout: new CheckoutService(repo, registry),
    webhook: new WebhookService(repo, registry),
    repo,
  });

  const router = Router();

  router.post(
    '/checkout',
    requireAuth,
    requireRole('student', 'parent'),
    // Slow down card-testing fraud per user (doc 04 §7).
    rateLimit({ name: 'checkout', max: 10, windowSeconds: 60 }),
    c.checkout,
  );

  // No auth middleware: the gateway is authenticated by its signature, not a
  // session token (doc 04 §3, §7).
  router.post('/webhooks/:provider', c.webhook);

  router.get('/transactions/:id', requireAuth, c.getTransaction);

  return router;
}
