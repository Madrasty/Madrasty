// Provider abstraction for realtime video (doc 01 §5 — "Don't build WebRTC from
// scratch"). Same instinct as payments and AI: nothing outside `providers/`
// imports a vendor SDK, so swapping Agora for 100ms is a new class plus a config
// value.

export type RtcRole = 'host' | 'audience';

export interface MintTokenInput {
  // Room identifier at the provider. Server-issued — see `channelFor`.
  channel: string;
  // Numeric identity inside the room. Derived from our user id server-side.
  uid: number;
  role: RtcRole;
  ttlSeconds: number;
}

// What a client needs to join, and nothing more. The app certificate never
// leaves the server.
export interface RtcCredentials {
  provider: string;
  appId: string;
  channel: string;
  uid: number;
  token: string;
  expiresAt: string; // ISO
}

export interface RtcProvider {
  readonly name: string;
  // Deterministic room name for a session. Deterministic so a reconnect lands in
  // the same room, and derived from ids we control so it can't be guessed into.
  channelFor(sessionId: string): string;
  mintToken(input: MintTokenInput): RtcCredentials;
}

// Thrown when a provider can't run because its credentials aren't configured —
// surfaced as "live classes unavailable" rather than a 500.
export class RtcProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Realtime provider "${provider}" is not configured.`);
    this.name = 'RtcProviderNotConfiguredError';
  }
}
