import path from 'node:path';
import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config/index';
import { errorMiddleware } from './lib/error-middleware';
import { createAuthRouter } from './modules/auth/index';
import { createLearningProgramsRouter } from './modules/learning-programs/index';
import { createPaymentsRouter } from './modules/payments/index';
import { createLoyaltyRouter } from './modules/loyalty/loyalty.routes';
import { createAdminRouter } from './modules/admin/index';

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
  app.use('/api/payments', createPaymentsRouter());
  app.use('/api/loyalty', createLoyaltyRouter());
  app.use('/api/admin', createAdminRouter());

  // Single-origin deploy: also serve the built client SPA (see CLIENT_DIST_PATH).
  // Static assets first, then a fallback that returns index.html for any
  // non-API GET so client-side routing works on deep links / refresh.
  if (config.CLIENT_DIST_PATH) {
    const clientDist = path.resolve(config.CLIENT_DIST_PATH);
    app.use(express.static(clientDist));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api') || req.path === '/health') return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Central error handler must be registered last.
  app.use(errorMiddleware);

  return app;
}

export const app = buildApp();
