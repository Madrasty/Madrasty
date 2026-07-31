// Provider abstraction for AI services (doc 01 §3). Same instinct as payments:
// no business logic imports an LLM SDK directly — it calls this interface, so
// swapping or adding a provider is a new class plus a config value and touches
// nothing else in the codebase.

// One turn of the conversation as handed to the provider. Deliberately only the
// two roles the API models: system context travels separately, never as a turn,
// so student text can never be mistaken for operator instructions.
export interface AiTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  // Operator instructions + curriculum context. Built server-side only.
  system: string;
  // Prior turns (oldest first) followed by the new question as the last entry.
  turns: AiTurn[];
}

export interface AiCompletionResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  // Set when the model stopped for a reason the caller should surface
  // (e.g. it hit the output cap, or safety classifiers declined).
  stopReason: string | null;
}

export interface AiProvider {
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

// Thrown when a provider can't run because its credentials aren't configured —
// surfaced to the client as "AI is unavailable" rather than a 500.
export class AiProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`AI provider "${provider}" is not configured.`);
    this.name = 'AiProviderNotConfiguredError';
  }
}

// Thrown when the provider itself failed (network, rate limit, upstream error).
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
