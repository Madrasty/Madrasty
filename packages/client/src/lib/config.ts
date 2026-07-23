import { z } from 'zod';
import { PAYMENT_PROVIDERS } from '@madrasty/shared';

// The only place allowed to read import.meta.env — everything else imports
// `config` (see CLAUDE.md "Never hardcode environment-specific values").
const envSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1),
  VITE_DEFAULT_LOCALE: z.string().min(1),
  VITE_SUPPORTED_LOCALES: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((locale) => locale.trim())
        .filter(Boolean),
    ),
  // Which gateway checkout uses. Defaults to the primary (Paymob); set to `mock`
  // locally to exercise the full loop without gateway credentials (dev only).
  VITE_PAYMENT_PROVIDER: z.enum(PAYMENT_PROVIDERS).default('paymob'),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid client environment configuration:\n${issues}`);
}

export const config = Object.freeze({
  apiBaseUrl: parsed.data.VITE_API_BASE_URL,
  defaultLocale: parsed.data.VITE_DEFAULT_LOCALE,
  supportedLocales: parsed.data.VITE_SUPPORTED_LOCALES,
  paymentProvider: parsed.data.VITE_PAYMENT_PROVIDER,
});
