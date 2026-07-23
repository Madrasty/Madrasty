import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../../config/index';
import {
  ProviderNotConfiguredError,
  type OrderInput,
  type PaymentInitResult,
  type PaymentProvider,
  type PaymentStatusValue,
  type RefundResult,
  type WebhookResult,
} from '../payment.provider';

// Paymob computes the callback HMAC over exactly these fields, in this order,
// concatenated with no separator (Paymob "Transaction processed callback" spec).
// Order is load-bearing — do not sort or reformat.
const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

function egpToCents(amountEgp: string): number {
  return Math.round(Number(amountEgp) * 100);
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

// Paymob serialises booleans as "true"/"false" and nulls/missing as "" in the
// HMAC string.
function hmacValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

// Card/wallet payments via Paymob's hosted iframe (doc 04 §2). No card data ever
// reaches our server — the user pays on Paymob's page (doc 04 §7).
export class PaymobProvider implements PaymentProvider {
  readonly name = 'paymob' as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private cfg() {
    const { PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_IFRAME_ID, PAYMOB_HMAC_SECRET } = config;
    if (!PAYMOB_API_KEY || !PAYMOB_INTEGRATION_ID || !PAYMOB_IFRAME_ID || !PAYMOB_HMAC_SECRET) {
      throw new ProviderNotConfiguredError('paymob');
    }
    return {
      apiKey: PAYMOB_API_KEY,
      integrationId: PAYMOB_INTEGRATION_ID,
      iframeId: PAYMOB_IFRAME_ID,
      hmacSecret: PAYMOB_HMAC_SECRET,
      baseUrl: config.PAYMOB_BASE_URL.replace(/\/+$/, ''),
    };
  }

  private async post(url: string, body: unknown): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Paymob request failed (${res.status}): ${JSON.stringify(json)}`);
    }
    return json;
  }

  async createPayment(order: OrderInput): Promise<PaymentInitResult> {
    const cfg = this.cfg();
    const amountCents = egpToCents(order.amountEgp);

    // 1) auth token
    const auth = await this.post(`${cfg.baseUrl}/auth/tokens`, { api_key: cfg.apiKey });
    const authToken = auth.token as string;

    // 2) register order (merchant_order_id ties Paymob's order back to our txn)
    const created = await this.post(`${cfg.baseUrl}/ecommerce/orders`, {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: order.currency,
      merchant_order_id: order.transactionId,
      items: [],
    });
    const orderId = created.id as number;

    // 3) payment key for the hosted iframe
    const billing = {
      email: order.customer?.email ?? 'NA',
      first_name: order.customer?.firstName ?? 'NA',
      last_name: order.customer?.lastName ?? 'NA',
      phone_number: order.customer?.phone ?? 'NA',
      apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA', shipping_method: 'NA',
      postal_code: 'NA', city: 'NA', country: 'NA', state: 'NA',
    };
    const key = await this.post(`${cfg.baseUrl}/acceptance/payment_keys`, {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
      billing_data: billing,
      currency: order.currency,
      integration_id: Number(cfg.integrationId),
    });
    const paymentToken = key.token as string;

    return {
      providerReference: String(orderId),
      redirectUrl: `${cfg.baseUrl}/acceptance/iframes/${cfg.iframeId}?payment_token=${paymentToken}`,
      raw: { orderId },
    };
  }

  verifyWebhook(payload: unknown, signature: string | undefined): boolean {
    if (!signature) return false;
    const obj = (payload as { obj?: Record<string, unknown> })?.obj;
    if (!obj) return false;
    const concatenated = HMAC_FIELDS.map((f) => hmacValue(getPath(obj, f))).join('');
    const expected = createHmac('sha512', this.cfg().hmacSecret).update(concatenated).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(payload: unknown): WebhookResult {
    const obj = (payload as { obj: Record<string, unknown> }).obj;
    const orderId = getPath(obj, 'order.id');
    const success = obj.success === true || obj.success === 'true';
    return {
      providerReference: String(orderId),
      status: success ? 'paid' : 'failed',
      raw: payload,
    };
  }

  async checkStatus(providerReference: string): Promise<PaymentStatusValue> {
    const cfg = this.cfg();
    const auth = await this.post(`${cfg.baseUrl}/auth/tokens`, { api_key: cfg.apiKey });
    const res = await this.fetchImpl(
      `${cfg.baseUrl}/ecommerce/orders/${providerReference}`,
      { headers: { Authorization: `Bearer ${auth.token as string}` } },
    );
    if (!res.ok) return 'pending';
    const orderData = (await res.json()) as Record<string, unknown>;
    if (orderData.payment_status === 'PAID' || orderData.paid_amount_cents) return 'paid';
    return 'pending';
  }

  async refund(providerReference: string, amountEgp: string): Promise<RefundResult> {
    const cfg = this.cfg();
    const auth = await this.post(`${cfg.baseUrl}/auth/tokens`, { api_key: cfg.apiKey });
    const result = await this.post(`${cfg.baseUrl}/acceptance/void_refund/refund`, {
      auth_token: auth.token as string,
      transaction_id: providerReference,
      amount_cents: egpToCents(amountEgp),
    });
    return { ok: true, raw: result };
  }
}
