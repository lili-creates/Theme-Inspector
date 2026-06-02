/** Accepts `example.com` and normalizes to `https://example.com` */
export function normalizeTargetUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const u = new URL(withProtocol);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Prepends https:// when missing; for client-side forms. */
export function ensureUrlProtocol(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
