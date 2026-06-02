import { c as canUsePlaywright, n as normalizeTargetUrl, i as isUrlAllowedForServerFetch, p as probeRenderedColorsWithTimeout, s as screenshotProbeTimeoutMs, b as isVercelServerless } from './urlSafety_BT_XEDha.mjs';

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
async function handleScreenshotRequest(payload) {
  if (!canUsePlaywright()) {
    return {
      status: 503,
      headers: JSON_HEADERS,
      body: {
        error: "Captura no disponible en este entorno",
        details: "Configura el servicio analyzer (Railway/Render) y PUBLIC_ANALYZE_API_URL en Vercel."
      }
    };
  }
  const rawUrl = typeof payload?.url === "string" ? payload.url.trim() : "";
  const url = normalizeTargetUrl(rawUrl);
  if (!url) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: { error: "Missing or invalid URL" }
    };
  }
  if (!isUrlAllowedForServerFetch(url)) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: {
        error: "URL not allowed",
        details: "No se pueden capturar direcciones locales o redes privadas."
      }
    };
  }
  const rendered = await probeRenderedColorsWithTimeout(url, screenshotProbeTimeoutMs());
  if (!rendered?.screenshotBase64) {
    return {
      status: 422,
      headers: JSON_HEADERS,
      body: {
        error: "No se pudo capturar la vista previa",
        details: "Comprueba que Chromium esté instalado en el servicio analyzer."
      }
    };
  }
  return {
    status: 200,
    headers: JSON_HEADERS,
    body: { url, previewScreenshot: rendered.screenshotBase64 }
  };
}

const prerender = false;
const config = {
  maxDuration: 10
};
const POST = async ({ request }) => {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
  if (isVercelServerless()) {
    return new Response(
      JSON.stringify({
        error: "Captura no disponible en Vercel",
        details: "Usa PUBLIC_ANALYZE_API_URL apuntando al servicio analyzer."
      }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
  const result = await handleScreenshotRequest(payload);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers ?? { "content-type": "application/json; charset=utf-8" }
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST,
  config,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
