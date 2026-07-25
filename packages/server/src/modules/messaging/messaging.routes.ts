import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { rateLimit } from '../../lib/rate-limit';
import { buildMessagingService } from './index';
import { createMessagingController } from './messaging.controller';

// Composition root. Routes (mounted at /api/messaging):
//   POST /conversations               parent opens/reopens a thread about a child
//   GET  /conversations               list: parent's own / teacher inbox / admin audit
//   GET  /conversations/:id           the thread (marks incoming read for participants)
//   POST /conversations/:id/messages  send a message (participants only; admin can't)
//   POST /conversations/:id/read      mark the thread read for the caller
//
// RBAC: coarse role gating here; per-record ownership (approved guardian /
// teacher-teaches-student / admin read-only) is enforced in the service (doc 10 §6).
export function createMessagingRouter(): Router {
  const messaging = buildMessagingService();
  const c = createMessagingController(messaging);

  const router = Router();

  router.get('/contacts', requireAuth, requireRole('parent'), c.listContacts);
  router.post('/conversations', requireAuth, requireRole('parent'), c.startConversation);
  router.get(
    '/conversations',
    requireAuth,
    requireRole('parent', 'teacher', 'admin', 'center_admin'),
    c.listConversations,
  );
  router.get(
    '/conversations/:id',
    requireAuth,
    requireRole('parent', 'teacher', 'admin', 'center_admin'),
    c.getThread,
  );
  router.post(
    '/conversations/:id/messages',
    requireAuth,
    requireRole('parent', 'teacher'),
    // Cheap anti-spam guard on the write path.
    rateLimit({ name: 'messaging-send', max: 60, windowSeconds: 60 }),
    c.sendMessage,
  );
  router.post(
    '/conversations/:id/read',
    requireAuth,
    requireRole('parent', 'teacher'),
    c.markRead,
  );

  return router;
}
