import { createHash, createHmac } from 'node:crypto';
import type { MintTokenInput, RtcCredentials, RtcProvider } from '../rtc.provider';

// Fixed secret for the dev/test provider only. The mock is never registered in
// production (see registry), so this constant never guards a real classroom.
const MOCK_SECRET = 'mock-rtc-secret';

// A no-credential provider so the whole schedule → start → join → attendance path
// runs locally and in tests without an Agora account. The token is a real HMAC
// over the same fields the Agora token covers, so a test can assert that role and
// channel actually bind to the token rather than trusting a stub string.
export class MockRtcProvider implements RtcProvider {
  readonly name = 'mock' as const;

  channelFor(sessionId: string): string {
    return `mock-${createHash('sha256').update(`live:${sessionId}`).digest('hex').slice(0, 16)}`;
  }

  mintToken({ channel, uid, role, ttlSeconds }: MintTokenInput): RtcCredentials {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const token = createHmac('sha256', MOCK_SECRET)
      .update(`${channel}:${uid}:${role}:${expiresAt.getTime()}`)
      .digest('hex');

    return {
      provider: this.name,
      appId: 'mock-app-id',
      channel,
      uid,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
