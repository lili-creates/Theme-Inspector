import { analyzeApiUrl } from "./apiBase";
import { ensureUrlProtocol } from "../url";

export type AnalyzeErrorBody = {
  error?: string;
  details?: string;
};

export async function postAnalyze(rawUrl: string): Promise<Record<string, unknown>> {
  const url = ensureUrlProtocol(rawUrl.trim());
  const res = await fetch(analyzeApiUrl("/api/analyze"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const data = (await res.json().catch(() => ({}))) as AnalyzeErrorBody & Record<string, unknown>;
  if (!res.ok) {
    const details = data.details ? ` (${data.details})` : "";
    throw new Error(`${data.error || `Error ${res.status}`}${details}`);
  }
  return data;
}
