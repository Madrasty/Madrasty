import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load the repo-root .env (two levels up from packages/server). A real env var,
// if already set, wins — dotenv never overrides existing values.
loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv(); // fallback: a local .env, if present

// This module is the ONLY place allowed to read process.env. Everything else
// imports the validated `config` object below (see CLAUDE.md).
const envSchema = z.object({
  // --- Required now ---
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  DEFAULT_LOCALE: z.string().min(1),
  SUPPORTED_LOCALES: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((locale) => locale.trim())
        .filter(Boolean),
    ),

  // --- Optional for now (blank until the matching integration is built) ---
  // Auth token lifetimes (sensible defaults; doc 01 §5, doc 11).
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Admin bootstrap (db:seed). Defaults are dev-only; override in production and
  // rotate the password after first login via POST /api/auth/change-password.
  ADMIN_EMAIL: z.string().min(1).default('admin@madrasty.local'),
  ADMIN_INITIAL_PASSWORD: z.string().min(1).default('0000'),

  // Registration / OTP / guardian approval (doc 11 §3-4, §8).
  OTP_CODE_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_EXPIRES_IN_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  GUARDIAN_APPROVAL_EXPIRES_IN_HOURS: z.coerce.number().int().positive().default(72),
  // App URLs.
  API_BASE_URL: z.string().optional(),
  CLIENT_BASE_URL: z.string().optional(),

  // Payments (doc 04).
  PAYMOB_API_KEY: z.string().optional(),
  PAYMOB_HMAC_SECRET: z.string().optional(),
  PAYMOB_INTEGRATION_ID: z.string().optional(),
  FAWRY_API_KEY: z.string().optional(),
  FAWRY_MERCHANT_CODE: z.string().optional(),
  VODAFONE_CASH_API_KEY: z.string().optional(),
  INSTAPAY_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // AI services (doc 01 §3).
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Object storage (doc 01 §5).
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Video hosting/streaming (doc 01 §5).
  BUNNY_STREAM_API_KEY: z.string().optional(),
  BUNNY_STREAM_LIBRARY_ID: z.string().optional(),
  MUX_TOKEN_ID: z.string().optional(),
  MUX_TOKEN_SECRET: z.string().optional(),

  // Realtime / live classes (doc 01 §5).
  AGORA_APP_ID: z.string().optional(),
  AGORA_APP_CERTIFICATE: z.string().optional(),

  // Notifications (doc 01 §3).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SMS_PROVIDER_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Fail fast at startup, naming each offending variable.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export type Config = z.infer<typeof envSchema>;

export const config: Readonly<Config> = Object.freeze(parsed.data);
