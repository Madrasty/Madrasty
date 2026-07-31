import type { Request, Response } from 'express';
import type { AskAiRequest, StartAiConversationRequest } from '@madrasty/shared';
import { config } from '../../config/index';
import { asyncHandler } from '../../lib/async-handler';
import type { Actor, AiService } from './ai.service';
import { askSchema, startConversationSchema } from './ai.schemas';

function localeOf(req: Request): string {
  const supported = config.SUPPORTED_LOCALES;
  const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  if (queryLocale && supported.includes(queryLocale)) return queryLocale;
  const header = req.headers['accept-language'];
  if (header) {
    for (const part of header.split(',')) {
      const tag = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
      if (tag && supported.includes(tag)) return tag;
    }
  }
  return config.DEFAULT_LOCALE;
}

function actorOf(req: Request): Actor {
  return { id: req.user!.id, role: req.user!.role };
}

export function createAiController(ai: AiService) {
  return {
    // GET /conversations — my threads, newest first, plus today's quota.
    listConversations: asyncHandler(async (req: Request, res: Response) => {
      const result = await ai.listConversations(actorOf(req), localeOf(req));
      res.status(200).json(result);
    }),

    // POST /conversations — open a thread, optionally scoped to a lesson/program.
    startConversation: asyncHandler(async (req: Request, res: Response) => {
      const body = startConversationSchema.parse(req.body ?? {}) as StartAiConversationRequest;
      const view = await ai.startConversation(actorOf(req), body, localeOf(req));
      res.status(201).json(view);
    }),

    // GET /conversations/:id — the full transcript (owner, or admin for audit).
    getConversation: asyncHandler(async (req: Request, res: Response) => {
      const view = await ai.getConversation(actorOf(req), req.params.id, localeOf(req));
      res.status(200).json(view);
    }),

    // DELETE /conversations/:id — owner discards a thread.
    deleteConversation: asyncHandler(async (req: Request, res: Response) => {
      await ai.deleteConversation(actorOf(req), req.params.id);
      res.status(204).send();
    }),

    // POST /conversations/:id/messages — ask a question, get the answer.
    ask: asyncHandler(async (req: Request, res: Response) => {
      const body = askSchema.parse(req.body) as AskAiRequest;
      const result = await ai.ask(actorOf(req), req.params.id, body, localeOf(req));
      res.status(201).json(result);
    }),

    // GET /usage — questions used/remaining today.
    getUsage: asyncHandler(async (req: Request, res: Response) => {
      const usage = await ai.getUsage(actorOf(req));
      res.status(200).json(usage);
    }),
  };
}
