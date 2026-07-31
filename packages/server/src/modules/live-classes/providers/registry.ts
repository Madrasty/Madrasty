import { config } from '../../../config/index';
import type { RtcProvider } from '../rtc.provider';
import { AgoraRtcProvider } from './agora.provider';
import { MockRtcProvider } from './mock.provider';

// Composition root for realtime providers — the ONLY place the app branches on
// which video vendor is in use (doc 01 §5). Everything downstream talks to
// RtcProvider.
//
// Same two guards as the AI provider registry: `mock` is refused in production so
// a misconfigured deploy fails at startup rather than handing students fake join
// credentials, and outside production missing Agora keys fall back to the mock so
// a fresh clone can run the feature end to end.
export function buildRtcProvider(): RtcProvider {
  const isProduction = config.NODE_ENV === 'production';

  if (config.RTC_PROVIDER === 'mock') {
    if (isProduction) {
      throw new Error('RTC_PROVIDER=mock is not allowed in production.');
    }
    return new MockRtcProvider();
  }

  if (!(config.AGORA_APP_ID && config.AGORA_APP_CERTIFICATE) && !isProduction) {
    return new MockRtcProvider();
  }
  return new AgoraRtcProvider();
}
