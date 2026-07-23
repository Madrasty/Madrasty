import type { Request, Response } from 'express';
import type { CheckoutRequest, TransactionView } from '@madrasty/shared';
import { asyncHandler } from '../../lib/async-handler';
import { HttpError } from '../../lib/http-error';
import { checkoutRequestSchema } from './payments.schemas';
import type { CheckoutService } from './checkout.service';
import type { WebhookService } from './webhook.service';
import type { PaymentsRepository, TransactionRecord } from './payments.repository';

function toView(t: TransactionRecord): TransactionView {
  return {
    id: t.id,
    purchasableType: t.purchasableType as TransactionView['purchasableType'],
    purchasableId: t.purchasableId,
    amountEgp: t.amountEgp,
    currency: t.currency,
    provider: t.paymentProvider as TransactionView['provider'],
    status: t.status as TransactionView['status'],
    createdAt: t.createdAt.toISOString(),
  };
}

// Where the gateway puts the signature. Paymob sends it as `?hmac=`; other
// providers use a header — accept both so providers stay swappable.
function signatureOf(req: Request): string | undefined {
  const header = req.get('x-payment-signature');
  if (header) return header;
  const q = req.query.hmac;
  return typeof q === 'string' ? q : undefined;
}

export interface PaymentsControllerDeps {
  checkout: CheckoutService;
  webhook: WebhookService;
  repo: PaymentsRepository;
}

export function createPaymentsController(deps: PaymentsControllerDeps) {
  return {
    checkout: asyncHandler(async (req: Request, res: Response) => {
      const body = checkoutRequestSchema.parse(req.body) as CheckoutRequest;
      const actor = req.user!;
      const result = await deps.checkout.checkout({ id: actor.id, role: actor.role }, body);
      res.status(201).json(result);
    }),

    // Public: authenticated by signature, not by a session (doc 04 §7). Always
    // 200 once the signature is valid so the gateway stops retrying a handled
    // event; an invalid signature surfaces as 401 from the service.
    webhook: asyncHandler(async (req: Request, res: Response) => {
      const outcome = await deps.webhook.handle(
        req.params.provider,
        req.body,
        signatureOf(req),
      );
      res.status(200).json({ received: true, outcome });
    }),

    getTransaction: asyncHandler(async (req: Request, res: Response) => {
      const txn = await deps.repo.getByIdForUser(req.params.id, req.user!.id);
      if (!txn) {
        throw HttpError.notFound('transaction_not_found', 'Transaction not found.');
      }
      res.status(200).json(toView(txn));
    }),
  };
}
