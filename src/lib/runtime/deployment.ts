/** Vercel Hobby serverless (solo UI; análisis vía PUBLIC_ANALYZE_API_URL). */
export function isVercelServerless(): boolean {
  return process.env.VERCEL === "1";
}

/**
 * Playwright en Node local o servicio analyzer. Desactivado en Vercel (usa PUBLIC_ANALYZE_API_URL).
 * Opt-out local: ENABLE_PLAYWRIGHT=false o DISABLE_PLAYWRIGHT=true
 */
export function canUsePlaywright(): boolean {
  if (process.env.DISABLE_PLAYWRIGHT === "true") return false;
  if (isVercelServerless()) return false;
  if (process.env.ENABLE_PLAYWRIGHT === "false") return false;
  if (process.env.PLAYWRIGHT_ENABLED === "true") return true;
  return true;
}

export function fetchTimeoutMs(): number {
  return isVercelServerless() ? 6_000 : 20_000;
}

export function maxStylesheetFetches(): number {
  return isVercelServerless() ? 12 : 40;
}

export function analyzeProbeTimeoutMs(): number {
  if (!canUsePlaywright()) return 0;
  return 25_000;
}

