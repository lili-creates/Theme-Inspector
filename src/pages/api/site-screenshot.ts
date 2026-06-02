import type { APIRoute } from "astro";
import { normalizeTargetUrl } from "../../lib/url";
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
    return new Response(JSON.stringify({ error: "Missing or invalid URL" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const rendered = await probeRenderedColorsWithTimeout(url, 25_000);
  if (!rendered?.screenshotBase64) {
    return new Response(
      JSON.stringify({
        error: "No se pudo capturar la vista previa",
        details: "Comprueba que Playwright esté instalado (npx playwright install chromium).",
      }),
      { status: 422, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  return new Response(
    JSON.stringify({ url, previewScreenshot: rendered.screenshotBase64 }),
    { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
  );
};
