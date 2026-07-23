import type { PaymentProviderName } from '@madrasty/shared';
import { config } from '../../../config/index';
import { HttpError } from '../../../lib/http-error';
import type { PaymentProvider } from '../payment.provider';
import { PaymobProvider } from './paymob.provider';
import { MockProvider } from './mock.provider';

// Composition root for providers. Selecting by name is the ONLY place the app
// branches on gateway (doc 04 §1) — everything downstream is provider-agnostic.
// The mock provider is registered only outside production so it can never settle
// real money.
export function buildProviderRegistry(): Map<PaymentProviderName, PaymentProvider> {
  const providers: PaymentProvider[] = [new PaymobProvider()];
  if (config.NODE_ENV !== 'production') {
    providers.push(new MockProvider());
  }
  return new Map(providers.map((p) => [p.name, p]));
}

export function getProvider(
  registry: Map<PaymentProviderName, PaymentProvider>,
  name: string,
): PaymentProvider {
  const provider = registry.get(name as PaymentProviderName);
  if (!provider) {
    throw HttpError.badRequest('unknown_payment_provider', `Unknown payment provider "${name}".`);
  }
  return provider;
}
