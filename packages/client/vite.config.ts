import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// .env lives at the repo root (shared with the server) — see CLAUDE.md
// "never hardcode environment-specific values".
const rootDir = resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  // Proxy target = the server's own base URL (API_BASE_URL). The browser calls a
  // relative /api path (VITE_API_BASE_URL=/api) so it stays same-origin with the
  // dev server — that keeps the httpOnly refresh cookie (sameSite=strict, scoped
  // to /api/auth) flowing without any CORS setup on the server.
  const apiTarget = env.API_BASE_URL || 'http://localhost:4000';

  return {
    envDir: rootDir,
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
