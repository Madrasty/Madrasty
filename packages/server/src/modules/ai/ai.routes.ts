import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { rateLimit } from '../../lib/rate-limit';
import { buildAiService } from './index';
import { createAiController } from './ai.controller';

// Composition root. Routes (mounted at /api/ai):
//   GET    /usage                       questions used / remaining today
//   GET    /conversations               my threads (newest first) + quota
//   POST   /conversations               open a thread (optional lesson/program scope)
//   GET    /conversations/:id           full transcript (owner, or admin for audit)
//   DELETE /conversations/:id           owner discards a thread
//   POST   /conversations/:id/messages  ask a question → answer
//
// RBAC lives in the service: asking is students-only and re-checks the guardian
// gate + enrollment on every question (doc 01 §7, doc 11).
//
// The ask endpoint is rate-limited on top of the daily quota: the quota is the
// cost budget, this is the burst guard — one runaway client loop shouldn't be
// able to spend a student's whole day of questions in a second.
export function createAiRouter(): Router {
  const ai = buildAiService();
  const c = createAiController(ai);

  const router = Router();

  router.get('/usage', requireAuth, c.getUsage);
  router.get('/conversations', requireAuth, c.listConversations);
  router.post('/conversations', requireAuth, c.startConversation);
  router.get('/conversations/:id', requireAuth, c.getConversation);
  router.delete('/conversations/:id', requireAuth, c.deleteConversation);
  router.post(
    '/conversations/:id/messages',
    requireAuth,
    rateLimit({ name: 'ai-ask', max: 10, windowSeconds: 60 }),
    c.ask,
  );

  return router;
}
