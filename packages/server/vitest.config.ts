import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Sets deterministic env vars BEFORE the config module is evaluated, so tests
    // never depend on a real .env, Postgres, or Redis being present.
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
