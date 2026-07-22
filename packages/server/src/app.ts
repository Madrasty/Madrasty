import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { errorMiddleware } from './lib/error-middleware';
import { createAuthRouter } from './modules/auth/index';
import { createLearningProgramsRouter } from './modules/learning-programs/index';

// Builds the Express app (no network listen), so tests can import it and the
// bootstrap in server.ts owns process concerns.
export function buildApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/learning-programs', createLearningProgramsRouter());

  // Central error handler must be registered last.
  app.use(errorMiddleware);

  return app;
}

export const app = buildApp();
