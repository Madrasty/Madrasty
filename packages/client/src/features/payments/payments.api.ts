import type { CheckoutRequest, CheckoutResult, TransactionView } from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Client for the payments API (server modules/payments). All calls are
// authenticated — checkout and the status poll require the Bearer access token.
// The client never sends a price: it says WHAT to buy; the server computes the
// amount (doc 04 §3).
export const paymentsApi = {
  checkout(body: CheckoutRequest) {
    return apiRequest<CheckoutResult>('/payments/checkout', {
      method: 'POST',
      body,
      auth: true,
    });
  },
  // Poll after the redirect back — access is confirmed only by the server's
  // webhook-driven status, never by the redirect itself (doc 04 §3).
  getTransaction(id: string) {
    return apiRequest<TransactionView>(`/payments/transactions/${id}`, { auth: true });
  },
};

// Where a pending transaction id is stashed before leaving for the gateway's
// hosted page, so the return screen can find it even when the provider's
// redirect doesn't preserve our query string.
export const PENDING_TXN_KEY = 'madrasty_pending_txn';
