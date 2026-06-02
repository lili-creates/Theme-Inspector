import type { APIRoute } from "astro";
import { buildAnalysisReport } from "../../lib/report/buildReport";
import { normalizeTargetUrl } from "../../lib/url";
import { collectCssFromPage } from "../../lib/fetch/cssCollector";
import { probeRenderedColorsWithTimeout } from "../../lib/renderProbe";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const rawUrl = typeof (payload as { url?: string })?.url === "string" ? payload.url.trim() : "";
  const url = normalizeTargetUrl(rawUrl);
  if (!url) {
    return new Response(
      JSON.stringify({
        error: "Missing or invalid URL",
        details: "Use a valid domain like https://example.com (http/https).",
      }),
      {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }

  try {
    const { css, html, variables, stylesheetCount } = await collectCssFromPage(url);

    if (!css.trim() && !html.trim()) {
      return new Response(
        JSON.stringify({
          error: "No content to analyze",
          details: "The URL returned no HTML/CSS to inspect.",
        }),
        { status: 422, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }

    const rendered = await probeRenderedColorsWithTimeout(url, 25_000);

    const report = buildAnalysisReport(
      url,
      css,
      stylesheetCount,
      variables,
      html,
      rendered?.colors,
      rendered?.bodyTextColors ?? rendered?.textColors,
      rendered?.buttonTextColors,
    );

    if (rendered?.screenshotBase64) {
      report.previewScreenshot = rendered.screenshotBase64;
    }

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFetch =
      /fetch failed|aborted|ENOTFOUND|ECONNREFUSED|certificate|timed out/i.test(message);

    return new Response(
      JSON.stringify({
        error: isFetch ? "Could not fetch the URL" : "Failed to analyze URL",
        details: message,
      }),
      {
        status: isFetch ? 422 : 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
};
