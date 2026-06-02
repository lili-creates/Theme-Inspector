import type { APIRoute } from "astro";
import { handleAnalyzeRequest } from "../../lib/api/analyzeHandler";
import { isVercelServerless } from "../../lib/runtime/deployment";

export const prerender = false;

export const config = {
  maxDuration: 10,
};

/** Fallback local cuando no hay PUBLIC_ANALYZE_API_URL (dev). En Vercel sin analyzer: mensaje claro. */
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

  if (isVercelServerless()) {
    return new Response(
      JSON.stringify({
        error: "Analyzer no configurado",
        details:
          "En Vercel define PUBLIC_ANALYZE_API_URL con la URL de tu servicio analyzer (Railway/Render). Ver README.",
      }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  const result = await handleAnalyzeRequest(payload);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers ?? { "content-type": "application/json; charset=utf-8" },
  });
};
