import { config } from '../../../config/index';
import type { AiProvider } from '../ai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { MockAiProvider } from './mock.provider';

// Composition root for AI providers — the ONLY place the app branches on which
// LLM vendor is in use (doc 01 §3). Everything downstream talks to AiProvider.
//
// Two guards worth keeping:
// - `mock` is refused in production, so a misconfigured deploy fails at startup
//   instead of quietly serving students stub answers.
// - Outside production, a missing ANTHROPIC_API_KEY falls back to the mock so a
//   fresh clone can run the feature end to end with no credentials.
export function buildAiProvider(): AiProvider {
  const isProduction = config.NODE_ENV === 'production';

  if (config.AI_PROVIDER === 'mock') {
    if (isProduction) {
      throw new Error('AI_PROVIDER=mock is not allowed in production.');
    }
    return new MockAiProvider();
  }

  if (!config.ANTHROPIC_API_KEY && !isProduction) {
    return new MockAiProvider();
  }
  return new AnthropicProvider();
}
