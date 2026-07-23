import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type OrderInput,
  type PaymentInitResult,
  type PaymentProvider,
  type PaymentStatusValue,
  type RefundResult,
  type WebhookResult,
} from '../payment.provider';

// Fixed secret for the dev/test provider only. The mock is never registered in
// production (see registry), so this constant never guards real money.
const MOCK_SECRET = 'mock-hmac-secret';

export interface MockWebhookBody {
  obj: { providerReference: string; success: boolean };
}

function sign(body: MockWebhookBody): string {
  return createHmac('sha256', MOCK_SECRET).update(JSON.stringify(body.obj)).digest('hex');
}

// Produce a signature a caller (a dev tool or a test) can send alongside a mock
// webhook body so it passes verifyWebhook — mirrors how a real gateway would sign.
export function signMockWebhook(body: MockWebhookBody): string {
  return sign(body);
}

// A no-network provider that exercises the full checkout → webhook → access path
// locally and in tests. Verification is a real HMAC so the "bad signature is
// rejected" path is genuinely tested, not stubbed.
export class MockProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  async createPayment(order: OrderInput): Promise<PaymentInitResult> {
    return {
      providerReference: `mock_${order.transactionId}`,
      redirectUrl: null,
      raw: { mock: true },
    };
  }

  verifyWebhook(payload: unknown, signature: string | undefined): boolean {
    if (!signature) return false;
    const body = payload as MockWebhookBody;
    if (!body?.obj?.providerReference) return false;
    const expected = sign(body);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(payload: unknown): WebhookResult {
    const body = payload as MockWebhookBody;
    return {
      providerReference: body.obj.providerReference,
      status: body.obj.success ? 'paid' : 'failed',
      raw: payload,
    };
  }

  async checkStatus(): Promise<PaymentStatusValue> {
    return 'pending';
  }

  async refund(): Promise<RefundResult> {
    return { ok: true, raw: { mock: true } };
  }
}
