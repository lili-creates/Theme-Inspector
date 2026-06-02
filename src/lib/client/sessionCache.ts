import { STORAGE_KEY, STORAGE_PREVIEW_KEY } from "../constants";

export function savePreviewCache(url: string, screenshot: string): void {
  if (!url || !screenshot) {
    sessionStorage.removeItem(STORAGE_PREVIEW_KEY);
    return;
  }
  try {
    sessionStorage.setItem(STORAGE_PREVIEW_KEY, JSON.stringify({ url, screenshot }));
  } catch {
    sessionStorage.removeItem(STORAGE_PREVIEW_KEY);
  }
}

export function loadPreviewCache(url: string): string {
  if (!url) return "";
  const raw = sessionStorage.getItem(STORAGE_PREVIEW_KEY);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { url?: string; screenshot?: string };
    if (parsed?.url === url && parsed?.screenshot) return parsed.screenshot;
  } catch {
    // ignore malformed cache
  }
  return "";
}

export function persistReportCache(
  url: string,
  report: Record<string, unknown> & { previewScreenshot?: string },
): void {
  const screenshot = report.previewScreenshot;
  const reportLite = { ...report };
  delete reportLite.previewScreenshot;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ url, report: reportLite }));
    savePreviewCache(url, screenshot || "");
  } catch {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ url, report: reportLite }));
    } catch {
      // ignore quota errors
    }
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
