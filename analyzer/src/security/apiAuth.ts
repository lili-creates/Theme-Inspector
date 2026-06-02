const HEADER = "x-analyzer-key";

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

export function isAnalyzerApiKeyValid(requestHeaders: HeaderSource): boolean {
  const required = process.env.ANALYZER_API_KEY?.trim();
  if (!required) return true;

  const provided =
    getHeader(requestHeaders, HEADER) ||
    getBearer(getHeader(requestHeaders, "authorization"));

  if (!provided) return false;
  return timingSafeEqual(provided, required);
}

function getHeader(headers: HeaderSource, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return undefined;
  const value = headers[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function getBearer(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const m = authorization.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const ANALYZER_API_KEY_HEADER = HEADER;
