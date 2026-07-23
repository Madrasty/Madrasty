import { z } from 'zod';

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
});
