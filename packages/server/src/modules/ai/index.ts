import { DrizzleAiRepository } from './ai.repository';
import { AiService } from './ai.service';
import { buildAiProvider } from './providers/registry';

// Composition helper: assembles the AI tutor from its repository + the provider
// selected by config (doc 01 §3).
export function buildAiService(): AiService {
  return new AiService(new DrizzleAiRepository(), buildAiProvider());
}
