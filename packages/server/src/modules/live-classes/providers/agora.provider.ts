import { createHash } from 'node:crypto';
import { RtcRole as AgoraRtcRole, RtcTokenBuilder } from 'agora-token';
import { config } from '../../../config/index';
import {
  RtcProviderNotConfiguredError,
  type MintTokenInput,
  type RtcCredentials,
  type RtcProvider,
} from '../rtc.provider';

// Agora RTC (doc 01 §5). Tokens are minted here and nowhere else: the app
// certificate is the signing key for every classroom on the platform, so it must
// never reach a client, a log line, or an API response.
export class AgoraRtcProvider implements RtcProvider {
  readonly name = 'agora' as const;

  private credentials(): { appId: string; appCertificate: string } {
    const appId = config.AGORA_APP_ID;
    const appCertificate = config.AGORA_APP_CERTIFICATE;
    if (!appId || !appCertificate) {
      throw new RtcProviderNotConfiguredError(this.name);
    }
    return { appId, appCertificate };
  }

  // Channel names are opaque and derived from the session id, not equal to it:
  // knowing a lesson id shouldn't be enough to guess the room. A token is still
  // required to join, so this is defence in depth rather than the lock itself.
  channelFor(sessionId: string): string {
    const digest = createHash('sha256').update(`live:${sessionId}`).digest('hex');
    return `mdr-${digest.slice(0, 24)}`;
  }

  mintToken({ channel, uid, role, ttlSeconds }: MintTokenInput): RtcCredentials {
    const { appId, appCertificate } = this.credentials();

    // Only the teacher publishes; students subscribe. This is what stops a
    // student from taking over the class's audio/video.
    const agoraRole = role === 'host' ? AgoraRtcRole.PUBLISHER : AgoraRtcRole.SUBSCRIBER;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      uid,
      agoraRole,
      ttlSeconds,
      ttlSeconds,
    );

    return {
      provider: this.name,
      appId,
      channel,
      uid,
      token,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  }
}
