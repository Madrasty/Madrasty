// Runs before any test module (and therefore before src/config is evaluated).
// dotenv never overrides an already-set var, so these fixed test values win over
// anything in a local .env — keeping the suite hermetic (no live DB/Redis).
process.env.NODE_ENV = 'test';
process.env.PORT ??= '4000';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/madrasty_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-access-secret-value-for-tests-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-value-for-tests-only';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.DEFAULT_LOCALE = 'ar';
process.env.SUPPORTED_LOCALES = 'ar,en';
