import type { NextFunction, Request, Response } from 'express';
import { redis } from './redis';
import { HttpError } from './http-error';

export interface RateLimitOptions {
  // Logical bucket name, e.g. 'checkout' — namespaces the Redis key.
  name: string;
  max: number;
  windowSeconds: number;
  // Derives the per-caller identity; defaults to the authed user, else the IP.
  keyOf?: (req: Request) => string;
}

// Fixed-window rate limiter backed by Redis (doc 04 §7 — slow down card-testing
// fraud on checkout; also for auth endpoints). INCR + EXPIRE on first hit keeps
// it atomic enough for this purpose without a Lua script.
export function rateLimit(opts: RateLimitOptions) {
  const identify = opts.keyOf ?? ((req: Request) => req.user?.id ?? req.ip ?? 'unknown');

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `ratelimit:${opts.name}:${identify(req)}`;
    let count: number;
    try {
      count = await redis.incr(key);
      if (count === 1) await redis.expire(key, opts.windowSeconds);
    } catch {
      // Fail open: a Redis blip must not take checkout down. (A hard-fail-closed
      // policy would be a DoS on ourselves.)
      next();
      return;
    }

    if (count > opts.max) {
      const ttl = await redis.ttl(key).catch(() => opts.windowSeconds);
      res.setHeader('Retry-After', String(Math.max(ttl, 1)));
      // This middleware is async, so forward the error to Express explicitly
      // rather than throwing (a thrown rejection would escape the error handler).
      next(HttpError.tooManyRequests('rate_limited', 'Too many requests — please slow down.'));
      return;
    }
    next();
  };
}
