/** Tokens in CSS names/selectors that indicate feedback / status colors, not brand. */
const SEMANTIC_NAME_RE =
  /\b(error|errors|err|danger|destructive|invalid|failure|failed|fail|alert-danger|negative|success|successful|valid|ok|positive|warning|warnings|warn|caution|info|informational|notice|critical|required|feedback|status|validation|form-error|field-error|toast|banner-error|message-error|message-warning|message-success|message-info|semantic)\b/i;

/** Whole-segment match (e.g. `--color-error-500`, `btn--danger`) */
const SEMANTIC_SEGMENT_RE =
  /(?:^|[-_/])(error|err|danger|destructive|invalid|fail|warning|warn|caution|success|valid|info|notice|critical|negative|positive)(?:[-_/]|$)/i;

export function isSemanticColorContext(text: string): boolean {
  const t = text.toLowerCase();
  if (SEMANTIC_SEGMENT_RE.test(t)) return true;
  if (SEMANTIC_NAME_RE.test(t)) {
    // Avoid false positives on brand-ish names
    if (/\b(primary|brand|logo|main|secondary|accent|klm|airline)\b/i.test(t)) return false;
    return true;
  }
  return false;
}

/** Classic UI feedback hues (error red, success green) — contextual, not absolute. */
export function isFeedbackChromaticColor(hsl: { h: number; s: number; l: number }): boolean {
  if ((hsl.h <= 30 || hsl.h >= 345) && hsl.s >= 28 && hsl.l >= 20 && hsl.l <= 62) {
    return true;
  }
  if (hsl.h >= 100 && hsl.h <= 155 && hsl.s >= 40 && hsl.l >= 18 && hsl.l <= 52) {
    return true;
  }
  return false;
}

/** Collect hex values tied to semantic CSS custom properties. */
export function collectSemanticHexesFromVariables(
  variables: Map<string, string>,
  resolve: (value: string) => string,
  toHex: (input: string) => string | null,
): Set<string> {
  const out = new Set<string>();
  for (const [name, value] of variables.entries()) {
    if (!isSemanticColorContext(name)) continue;
    const resolved = resolve(value);
    const hex = toHex(resolved);
    if (hex) out.add(hex.toUpperCase());
    // Also pick literals inside the value
    for (const m of resolved.matchAll(/#(?:[0-9a-fA-F]{3,8})\b/g)) {
      const h = toHex(m[0]!);
      if (h) out.add(h.toUpperCase());
    }
  }
  return out;
}

/** Hex literals used only in rules whose selectors are semantic (e.g. `.error`, `.form-invalid`). */
export function collectSemanticHexesFromCssRules(
  css: string,
  variables: Map<string, string>,
  resolve: (value: string) => string,
  toHex: (input: string) => string | null,
): Set<string> {
  const out = new Set<string>();
  const ruleRe = /([^{}@/][^{}]*)\{([^{}]*)\}/g;
  let ruleMatch: RegExpExecArray | null;
  while ((ruleMatch = ruleRe.exec(css)) !== null) {
    const selector = ruleMatch[1] ?? "";
    if (!isSemanticColorContext(selector) && !/\b(alert|notification|toast|snackbar|banner-message)\b/i.test(selector)) {
      continue;
    }
    const body = ruleMatch[2] ?? "";
    for (const m of body.matchAll(/#(?:[0-9a-fA-F]{3,8})\b/gi)) {
      const h = toHex(m[0]!);
      if (h) out.add(h.toUpperCase());
    }
    for (const m of body.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      const v = variables.get(m[1]!);
      if (!v) continue;
      const h = toHex(resolve(v));
      if (h) out.add(h.toUpperCase());
    }
  }
  return out;
}
