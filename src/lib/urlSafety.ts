export const MAX_TARGET_URL_LENGTH = 2048;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal"];

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("::ffff:")) {
    const v4 = h.slice(7);
    if (isPrivateIpv4(v4)) return true;
  }
  return false;
}

/** Blocks decimal/hex/octal IP obfuscation (e.g. 2130706433 → 127.0.0.1). */
function isObfuscatedNumericHost(host: string): boolean {
  if (/^\d+$/.test(host)) return true;
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  if (/^0[0-7]+$/.test(host)) return true;
  return false;
}

function hostnameBlocked(host: string): boolean {
  const lower = host.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  if (isPrivateIpv4(lower)) return true;
  if (lower.includes(":") && isPrivateIpv6(lower)) return true;
  if (isObfuscatedNumericHost(lower)) return true;
  if (lower === "169.254.169.254") return true;
  return false;
}

export function isUrlAllowedForServerFetch(urlString: string): boolean {
  if (urlString.length > MAX_TARGET_URL_LENGTH) return false;

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname;
  if (!host || hostnameBlocked(host)) return false;

  // Non-default ports often used for internal services
  if (parsed.port) {
    const port = Number(parsed.port);
    if (!Number.isFinite(port) || port < 1 || port > 65535) return false;
  }

  return true;
}

/** Validates raw user input before normalization. */
export function isRawUrlInputAllowed(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_TARGET_URL_LENGTH) return false;
  if (/[\s<>"'`]/.test(trimmed)) return false;
  if (/^(javascript|data|file|blob|ftp):/i.test(trimmed)) return false;
  return true;
}
