/**
 * Base URL for analyze APIs.
 * - Empty: same origin (`/api/analyze`) — local Astro dev with optional Playwright.
 * - Set `PUBLIC_ANALYZE_API_URL` on Vercel to your Railway/Render analyzer (evita timeout 10s).
 */
export function getAnalyzeApiBase(): string {
  const raw = import.meta.env.PUBLIC_ANALYZE_API_URL;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().replace(/\/$/, "");
  return trimmed;
}

export function analyzeApiUrl(path: string): string {
  const base = getAnalyzeApiBase();
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
