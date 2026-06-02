import { normalizeTargetUrl } from "../url";
import { isRawUrlInputAllowed, isUrlAllowedForServerFetch } from "../urlSafety";

export function parseAllowedAnalysisUrl(raw: string): string | null {
  if (!isRawUrlInputAllowed(raw)) return null;
  const normalized = normalizeTargetUrl(raw);
  if (!normalized || !isUrlAllowedForServerFetch(normalized)) return null;
  return normalized;
}
