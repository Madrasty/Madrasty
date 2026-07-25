import type { Request, Response } from 'express';
import type { SendMessageRequest, StartConversationRequest } from '@madrasty/shared';
import { asyncHandler } from '../../lib/async-handler';
import type { Actor, MessagingService } from './messaging.service';
import { sendMessageSchema, startConversationSchema } from './messaging.schemas';

// req.user is guaranteed by requireAuth on every route below.
function actorOf(req: Request): Actor {
  return { id: req.user!.id, role: req.user!.role };
}

export function createMessagingController(messaging: MessagingService) {
  return {
    // POST /conversations — parent opens (or re-opens) a thread about a child.
    startConversation: asyncHandler(async (req: Request, res: Response) => {
      const body = startConversationSchema.parse(req.body) as StartConversationRequest;
      const conversation = await messaging.startConversation(actorOf(req), body);
      res.status(201).json(conversation);
    }),

    // GET /contacts — (teacher, child) pairs a parent may start a thread about.
    listContacts: asyncHandler(async (req: Request, res: Response) => {
      const contacts = await messaging.listContacts(actorOf(req));
      res.status(200).json({ contacts });
    }),

    // GET /conversations — parent's own / teacher's inbox / admin's audit list.
    listConversations: asyncHandler(async (req: Request, res: Response) => {
      const conversations = await messaging.listConversations(actorOf(req));
      res.status(200).json({ conversations });
    }),

    // GET /conversations/:id — the thread; marks incoming read for participants.
    getThread: asyncHandler(async (req: Request, res: Response) => {
      const thread = await messaging.getThread(actorOf(req), req.params.id);
      res.status(200).json(thread);
    }),

    // POST /conversations/:id/messages — send a message (participants only).
    sendMessage: asyncHandler(async (req: Request, res: Response) => {
      const { body } = sendMessageSchema.parse(req.body) as SendMessageRequest;
      const message = await messaging.sendMessage(actorOf(req), req.params.id, body);
      res.status(201).json(message);
    }),

    // POST /conversations/:id/read — mark the thread read for the caller.
    markRead: asyncHandler(async (req: Request, res: Response) => {
      await messaging.markRead(actorOf(req), req.params.id);
      res.status(204).send();
    }),
  };
}
