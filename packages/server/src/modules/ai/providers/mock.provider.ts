import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiProvider,
} from '../ai.provider';

// A no-network provider so the whole ask → persist → quota path runs locally and
// in tests without an API key or a cent of spend. Never registered in production
// (see registry.ts), so it can never answer a real student.
//
// The reply deliberately echoes the question and whether curriculum context was
// attached — that makes context-building bugs visible in dev instead of hiding
// behind a plausible-sounding generated answer.
export class MockAiProvider implements AiProvider {
  readonly name = 'mock' as const;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const question = request.turns.at(-1)?.content ?? '';
    const text = [
      '[mock tutor] I would answer this using the context I was given.',
      `Question: ${question}`,
      `Context characters: ${request.system.length}`,
      `Prior turns replayed: ${Math.max(request.turns.length - 1, 0)}`,
    ].join('\n');

    return {
      text,
      model: 'mock',
      // Rough stand-ins so quota/usage reporting has non-zero numbers to render.
      inputTokens: Math.ceil((request.system.length + question.length) / 4),
      outputTokens: Math.ceil(text.length / 4),
      stopReason: 'end_turn',
    };
  }
}
