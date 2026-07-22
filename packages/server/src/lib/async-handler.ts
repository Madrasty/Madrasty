import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Wraps an async route handler so a rejected promise is forwarded to Express's
// error middleware instead of crashing the process as an unhandled rejection.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
