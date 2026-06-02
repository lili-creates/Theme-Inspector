import { STORAGE_KEY } from "../constants";

export function persistReportCache(
  url: string,
  report: Record<string, unknown>,
): void {
  const reportLite = { ...report };
  delete reportLite.hints;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ url, report: reportLite }));
  } catch {
    // ignore quota errors
  }
}

export function loadCachedReport(url: string): Record<string, unknown> | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as { url?: string; report?: Record<string, unknown> };
    if (cached?.url === url && cached?.report) return cached.report;
  } catch {
    // ignore
  }
  return null;
}
