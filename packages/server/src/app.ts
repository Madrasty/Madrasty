import express, { type Request, type Response } from 'express';

const app = express();

// Read environment-specific values from env, never hardcode (see CLAUDE.md).
const PORT = Number(process.env.PORT ?? 4000);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Madrasty server listening on port ${PORT}`);
});

export { app };
