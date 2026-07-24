import type { CheckoutQuoteRequest, CheckoutQuoteResult, LoyaltySummary } from '@madrasty/shared';
import { apiRequest } from '../../lib/api';

// Client for the loyalty API (server modules/loyalty). Both calls are
// authenticated. `locale` is forwarded so the tier name resolves for the UI
// language. The quote NEVER sends a price or a computed discount — the server
// prices the order from its own records (doc 04 §3, doc 05 §4).
export const loyaltyApi = {
  getSummary(locale?: string) {
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return apiRequest<LoyaltySummary>(`/loyalty/me${qs}`, { auth: true });
  },
  quote(body: CheckoutQuoteRequest) {
    return apiRequest<CheckoutQuoteResult>('/loyalty/quote', {
      method: 'POST',
      body,
      auth: true,
    });
  },
};
