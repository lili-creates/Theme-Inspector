/** Escape text inserted into HTML templates (mitigates XSS from untrusted CSS values). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** CSS color tokens for inline styles (hex only). */
export function escapeCssColorHex(hex: string): string {
  const normalized = hex.trim().toUpperCase();
  if (!/^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(normalized)) return "transparent";
  return normalized;
}
