import { isUrlAllowedForServerFetch } from "../urlSafety";

const MAX_REDIRECTS = 5;

/**
 * Fetch with manual redirect handling so each hop is checked (SSRF via redirect).
 */
export async function safeFetch(
  url: string,
  init?: RequestInit,
  redirectCount = 0,
): Promise<Response> {
  if (!isUrlAllowedForServerFetch(url)) {
    throw new Error("URL not allowed");
  }
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error("Too many redirects");
  }

  const res = await fetch(url, { ...init, redirect: "manual" });

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) throw new Error(`Redirect without location (${res.status})`);
    const nextUrl = new URL(location, url).toString();
    return safeFetch(nextUrl, init, redirectCount + 1);
  }

  return res;
}

export async function safeFetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await safeFetch(url, init);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  return await res.text();
}
