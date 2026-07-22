// Egyptian mobile numbers arrive in several shapes (+201001234567, 201001234567,
// 01001234567, 1001234567). Normalize to the bare national form (1XXXXXXXXX) so
// two numbers can be compared regardless of how they were typed/stored.
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('20')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

// The plausible stored formats for a given number, used to match a parent whose
// phone may have been saved in any of these shapes.
export function phoneCandidates(raw: string): string[] {
  const n = normalizePhone(raw);
  return [n, `0${n}`, `20${n}`, `+20${n}`];
}
