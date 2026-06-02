/** Variables del design system que declaran un color de marca. */
export function isDeclaredBrandTokenName(name: string): boolean {
  const lower = name.toLowerCase();
  if (/\bbrand\b/.test(lower) || /--[a-z0-9-]*brand[a-z0-9-]*\b/.test(lower)) {
    return true;
  }
  if (/(^|[-_])(primary|secondary)(?:[-_]|$)/.test(lower) && /color|colour|bg|fill/.test(lower)) {
    return true;
  }
  return false;
}

/** Etiqueta semántica inferida del nombre (solo informativa; no excluye si el color domina en pantalla). */
export function getBrandTokenSemanticHint(
  name: string,
): "error" | "success" | "warning" | "info" | null {
  const lower = name.toLowerCase();
  if (!isDeclaredBrandTokenName(lower)) return null;
  if (/\b(error|danger|destructive|invalid|fail|negative)\b/.test(lower)) return "error";
  if (/\b(success|valid|positive|ok)\b/.test(lower)) return "success";
  if (/\b(warning|warn|caution)\b/.test(lower)) return "warning";
  if (/\b(info|notice|informational)\b/.test(lower)) return "info";
  if (/\b(copper-red|brand-red|alert-red|signal-red)\b/.test(lower)) return "error";
  return null;
}

export function getTokenRoleHint(name: string): "primary" | "secondary" | null {
  const lower = name.toLowerCase();
  if (/\b(foreground|text|copy|on-)\b/.test(lower)) return null;
  if (
    /\b(primary|main|deepblue|navy|midnight|brand-blue|lhdeepblue)\b/.test(lower) &&
    !/\b(yellow|red|error|warning|success|secondary)\b/.test(lower)
  ) {
    return "primary";
  }
  if (
    /\b(secondary|accent|lhyellow|sunglow|brand-yellow|gold)\b/.test(lower) &&
    !/\b(error|danger|red|copper|invalid)\b/.test(lower)
  ) {
    return "secondary";
  }
  return null;
}

export const SEMANTIC_HINT_LABELS: Record<string, string> = {
  error: "uso semántico (error)",
  success: "uso semántico (éxito)",
  warning: "uso semántico (aviso)",
  info: "uso semántico (info)",
};
