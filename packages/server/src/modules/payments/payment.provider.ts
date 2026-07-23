import type { PaymentProviderName } from '@madrasty/shared';

// What checkout hands a provider to start a payment. Contains the SERVER-computed
// amount (doc 04 §3) — a provider never sees or trusts a client price.
export interface OrderInput {
  // Our transaction id; passed to the gateway as its merchant order reference so
  // a webhook can be tied back to this exact transaction.
  transactionId: string;
  amountEgp: string; // decimal string, e.g. "149.00"
  currency: string;
  description?: string;
  customer?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
}

// Result of creating a payment: the gateway reference we persist + whatever the
// client needs to complete payment (a hosted-page/iframe URL). Provider-agnostic.
export interface PaymentInitResult {
  providerReference: string | null;
  redirectUrl: string | null;
  raw?: unknown;
}

// The only three states the rest of the system cares about; a provider maps its
// own richer status vocabulary onto these.
export type PaymentStatusValue = 'pending' | 'paid' | 'failed';

// Normalised view of an inbound webhook: which transaction it concerns + outcome.
export interface WebhookResult {
  providerReference: string;
  status: PaymentStatusValue;
  raw: unknown;
}

export interface RefundResult {
  ok: boolean;
  raw?: unknown;
}

// One interface, one class per gateway (doc 04 §1). payment.service.ts selects by
// name and contains no gateway-specific code; adding a provider touches nothing
// else. `verifyWebhook` MUST be called before `parseWebhook` is trusted.
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createPayment(order: OrderInput): Promise<PaymentInitResult>;
  // True only if the payload's signature/HMAC checks out (doc 04 §7).
  verifyWebhook(payload: unknown, signature: string | undefined): boolean;
  // Extract the transaction reference + outcome from a (verified) webhook body.
  parseWebhook(payload: unknown): WebhookResult;
  // Server-side status pull, the fallback to a webhook (doc 04 §3).
  checkStatus(providerReference: string): Promise<PaymentStatusValue>;
  refund(providerReference: string, amountEgp: string): Promise<RefundResult>;
}

// Thrown when a provider can't run because its credentials aren't configured —
// surfaced to the client as a 503-style "provider unavailable" rather than a 500.
export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Payment provider "${provider}" is not configured.`);
    this.name = 'ProviderNotConfiguredError';
  }
}
