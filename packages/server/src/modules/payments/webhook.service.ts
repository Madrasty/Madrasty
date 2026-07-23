import type { PaymentProviderName } from '@madrasty/shared';
import { HttpError } from '../../lib/http-error';
import type { PaymentProvider } from './payment.provider';
import { getProvider } from './providers/registry';
import type { PaymentsRepository } from './payments.repository';

export type WebhookOutcome = 'settled' | 'failed' | 'already_settled' | 'unmatched';

// Handles inbound provider webhooks (doc 04 §3, §7). The signature is verified
// BEFORE any effect; matching + settlement are idempotent so the same event
// delivered twice grants access exactly once.
export class WebhookService {
  constructor(
    private readonly repo: PaymentsRepository,
    private readonly registry: Map<PaymentProviderName, PaymentProvider>,
  ) {}

  async handle(
    providerName: string,
    payload: unknown,
    signature: string | undefined,
  ): Promise<WebhookOutcome> {
    const provider = getProvider(this.registry, providerName);

    // Reject anything we can't cryptographically attribute to the gateway. This
    // is the trust boundary — a forged callback must never grant access (§7).
    if (!provider.verifyWebhook(payload, signature)) {
      throw HttpError.unauthorized('invalid_signature', 'Webhook signature verification failed.');
    }

    const parsed = provider.parseWebhook(payload);
    const txn = await this.repo.findByProviderReference(
      provider.name,
      parsed.providerReference,
    );
    // Unknown reference: acknowledge (so the gateway stops retrying) without effect.
    if (!txn) return 'unmatched';

    if (parsed.status === 'failed') {
      await this.repo.markFailed(txn.id, payload);
      return 'failed';
    }

    // paid → grant access to the beneficiary student (falls back to the payer for
    // a self-purchase). Only 'learning_program' is wired today.
    if (txn.purchasableType !== 'learning_program') return 'unmatched';
    const studentId = txn.beneficiaryId ?? txn.userId;
    const settled = await this.repo.settlePaidAndGrant(
      txn.id,
      txn.purchasableId,
      studentId,
      payload,
    );
    return settled ? 'settled' : 'already_settled';
  }
}
