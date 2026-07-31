import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../../config/index';
import {
  AiProviderError,
  AiProviderNotConfiguredError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
} from '../ai.provider';

// Claude-backed tutor (doc 01 §3 — "via LLM API calls, not self-hosted models").
// The model id, output cap and effort level all come from the typed config so
// moving to a different model is a config change, not a code change.
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;

  private client: Anthropic | null = null;

  // Lazily constructed: the server must boot fine with no AI key set, and only
  // fail when someone actually asks a question.
  private getClient(): Anthropic {
    if (!config.ANTHROPIC_API_KEY) {
      throw new AiProviderNotConfiguredError(this.name);
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const client = this.getClient();

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: config.AI_MODEL,
        max_tokens: config.AI_MAX_OUTPUT_TOKENS,
        output_config: { effort: config.AI_EFFORT },
        // Operator instructions and curriculum context live here, never as a
        // conversation turn — student text stays strictly in the user role.
        system: request.system,
        messages: request.turns.map((turn) => ({ role: turn.role, content: turn.content })),
      });
    } catch (error) {
      throw toProviderError(error);
    }

    // Safety classifiers can decline a request: HTTP 200 with an empty/partial
    // body. Check stop_reason BEFORE reading content, or an index into
    // content[0] throws on a refusal.
    if (message.stop_reason === 'refusal') {
      throw new AiProviderError('The assistant declined to answer this question.', false);
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (text === '') {
      throw new AiProviderError('The assistant returned an empty answer.', true);
    }

    return {
      text,
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      stopReason: message.stop_reason,
    };
  }
}

// Map the SDK's typed exceptions onto our two-state model: retryable (the client
// may try again) vs not (asking again changes nothing).
function toProviderError(error: unknown): Error {
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError('The assistant is busy. Try again in a moment.', true);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiProviderError('Could not reach the assistant.', true);
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiProviderNotConfiguredError('anthropic');
  }
  if (error instanceof Anthropic.APIError) {
    // 5xx is worth another attempt; a 4xx means the request itself is wrong.
    const retryable = (error.status ?? 500) >= 500;
    return new AiProviderError(error.message, retryable);
  }
  return error instanceof Error ? error : new AiProviderError(String(error), false);
}
