import type { LocalizedInput } from '@madrasty/shared';

// Builds a { ar?, en? } payload from two inputs, omitting blanks. Returns
// undefined when both are empty so the field is left untouched on the server.
export function toLocalized(en: string, ar: string): LocalizedInput | undefined {
  const value: LocalizedInput = {};
  if (en.trim()) value.en = en.trim();
  if (ar.trim()) value.ar = ar.trim();
  return value.en || value.ar ? value : undefined;
}
