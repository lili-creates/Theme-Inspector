import { collectCssFromPage } from "../fetch/cssCollector";
import { buildAnalysisReport } from "../report/buildReport";
import { probeRenderedColorsWithTimeout } from "../renderProbe";
import { analyzeProbeTimeoutMs } from "../runtime/deployment";
import { publicErrorDetails } from "../security/safeError";
import { parseAllowedAnalysisUrl } from "../security/validateAnalysisUrl";

export type AnalyzeRequestBody = { url?: string };

export type ApiJsonResponse = {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handleAnalyzeRequest(
  payload: unknown,
): Promise<ApiJsonResponse> {
  const rawUrl =
    typeof (payload as AnalyzeRequestBody)?.url === "string"
      ? (payload as AnalyzeRequestBody).url!.trim()
      : "";

  const url = parseAllowedAnalysisUrl(rawUrl);

  if (!url) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: {
        error: "Missing or invalid URL",
        details:
          "Usa un dominio público https://… sin credenciales en la URL ni direcciones locales.",
      },
    };
  }

  try {
    const { css, html, variables, stylesheetCount } = await collectCssFromPage(url);

    if (!css.trim() && !html.trim()) {
      return {
        status: 422,
        headers: JSON_HEADERS,
        body: {
          error: "No content to analyze",
          details: "The URL returned no HTML/CSS to inspect.",
        },
      };
    }

    const rendered = await probeRenderedColorsWithTimeout(url, analyzeProbeTimeoutMs());

    const report = buildAnalysisReport(
      url,
      css,
      stylesheetCount,
      variables,
      html,
      rendered?.colors,
      rendered?.bodyTextColors ?? rendered?.textColors,
      rendered?.buttonTextColors,
      rendered?.backgroundColors,
      rendered?.buttonFillColors,
      rendered?.headingTextColors,
    );

    return {
      status: 200,
      headers: JSON_HEADERS,
      body: report as unknown as Record<string, unknown>,
    };
  } catch (err) {
    const isFetch =
      /fetch failed|aborted|ENOTFOUND|ECONNREFUSED|certificate|timed out|URL not allowed|Too many redirects/i.test(
        err instanceof Error ? err.message : String(err),
      );

    return {
      status: isFetch ? 422 : 500,
      headers: JSON_HEADERS,
      body: {
        error: isFetch ? "Could not fetch the URL" : "Failed to analyze URL",
        details: publicErrorDetails(err, isFetch),
      },
    };
  }
}
