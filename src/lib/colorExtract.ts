import { parseColorToHsl, parseHexColor, parseRgbColor, rgbToHsl } from "./color/colorMath";
import { isSemanticColorContext } from "./semanticColors";
import * as cheerio from "cheerio";

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  navy: "#000080",
  teal: "#008080",
  aqua: "#00ffff",
  purple: "#800080",
  maroon: "#800000",
  transparent: "",
};

export type ColorUsage = {
  hex: string;
  hsl: { h: number; s: number; l: number };
  count: number;
  score: number;
  /** Accumulated weight from error/success/warning/info contexts — not brand. */
  semanticWeight: number;
  /** Weight from `color:` on typographic / surface selectors. */
  textScore: number;
  /** Weight from `color:` on button / CTA selectors. */
  buttonTextScore: number;
  /** Weight from `color:` on headings / títulos de marca / logo. */
  headingTextScore: number;
};

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const h = (n: number) => clamp(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function normalizeColorToHex(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw === "inherit" || raw === "currentcolor" || raw === "transparent") return null;

  const named = NAMED_COLORS[raw.toLowerCase()];
  if (named !== undefined) {
    if (!named) return null;
    return named.toUpperCase();
  }

  const hex = parseHexColor(raw);
  if (hex) return rgbToHex(hex.r, hex.g, hex.b);

  const rgb = parseRgbColor(raw);
  if (rgb) return rgbToHex(rgb.r, rgb.g, rgb.b);

  const hslMatch = raw
    .toLowerCase()
    .match(/^hsla?\(\s*([0-9.]+)(?:deg)?\s*,?\s*([0-9.]+)%\s*,?\s*([0-9.]+)%/);
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    const rgbFromHsl = hslToRgb(h, s, l);
    return rgbToHex(rgbFromHsl.r, rgbFromHsl.g, rgbFromHsl.b);
  }

  const hslMatchSpace = raw
    .toLowerCase()
    .match(/^hsla?\(\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%/);
  if (hslMatchSpace) {
    const h = Number(hslMatchSpace[1]);
    const s = Number(hslMatchSpace[2]);
    const l = Number(hslMatchSpace[3]);
    const rgbFromHsl = hslToRgb(h, s, l);
    return rgbToHex(rgbFromHsl.r, rgbFromHsl.g, rgbFromHsl.b);
  }

  return null;
}

export type RenderedColorLookup = {
  lookup: Map<string, number>;
  total: number;
  max: number;
  p75: number;
  sampled: boolean;
};

/** Agrupa señales del viewport por hex normalizado (#RRGGBB). */
export function buildRenderedColorLookup(
  signals?: Record<string, number>,
): RenderedColorLookup {
  const lookup = new Map<string, number>();
  if (!signals) {
    return { lookup, total: 0, max: 0, p75: 0, sampled: false };
  }

  for (const [key, raw] of Object.entries(signals)) {
    const hex = normalizeColorToHex(key);
    if (!hex) continue;
    lookup.set(hex, (lookup.get(hex) ?? 0) + Math.max(0, raw));
  }

  const values = [...lookup.values()];
  const total = values.reduce((sum, v) => sum + v, 0);
  const max = values.length > 0 ? Math.max(...values) : 0;
  const sorted = [...values].sort((a, b) => a - b);
  const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;

  return { lookup, total, max, p75, sampled: total > 0 };
}

/** Peso en viewport solo si el hex coincide exactamente (roles de marca). */
export function getRenderedColorWeightExact(lookup: Map<string, number>, hex: string): number {
  const key = normalizeColorToHex(hex);
  if (!key) return 0;
  return lookup.get(key) ?? 0;
}

/**
 * Suma peso de viewport en la misma familia de matiz (p. ej. #F7C600 ↔ #FFCC00 en logo).
 * Solo para canales de superficie/título — no para mezclar rojos y azules.
 */
export function getRenderedColorFamilyWeight(
  lookup: Map<string, number>,
  hex: string,
  maxHueDistance = 16,
): number {
  const key = normalizeColorToHex(hex);
  if (!key) return 0;
  const hsl = parseColorToHsl(key);
  if (!hsl || hsl.s < 12) return lookup.get(key) ?? 0;

  let sum = 0;
  for (const [candidate, weight] of lookup) {
    if (weight <= 0) continue;
    const candidateHsl = parseColorToHsl(candidate);
    if (!candidateHsl) continue;
    if (hueDistance(hsl.h, candidateHsl.h) <= maxHueDistance) {
      sum += weight;
    }
  }
  return sum;
}

/** Peso en viewport; si no hay match exacto, aproxima por matiz cercano. */
export function getRenderedColorWeight(lookup: Map<string, number>, hex: string): number {
  const key = normalizeColorToHex(hex) ?? hex.toUpperCase();
  const direct = lookup.get(key);
  if (direct != null && direct > 0) return direct;

  const hsl = parseColorToHsl(key);
  if (!hsl) return 0;

  let best = 0;
  let bestDist = Infinity;
  for (const [candidate, weight] of lookup) {
    if (weight <= 0) continue;
    const candidateHsl = parseColorToHsl(candidate);
    if (!candidateHsl) continue;
    const dist = hueDistance(hsl.h, candidateHsl.h) + Math.abs(hsl.l - candidateHsl.l) * 0.35;
    if (dist < bestDist && dist <= 20) {
      bestDist = dist;
      best = weight;
    }
  }
  return best;
}

export function resolveCssColor(value: string, variables: Map<string, string>, depth = 0): string {
  if (depth > 6) return value.trim();
  let v = value.trim();

  const varRe = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^)]+))?\s*\)/g;
  v = v.replace(varRe, (_m, name: string, fallback?: string) => {
    const fromMap = variables.get(name);
    if (fromMap) return resolveCssColor(fromMap, variables, depth + 1);
    if (fallback) return resolveCssColor(fallback.trim(), variables, depth + 1);
    return "";
  });

  return v.trim();
}

function extractColorTokens(fragment: string): string[] {
  const tokens: string[] = [];
  const hexRe = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  const rgbRe = /rgba?\([^)]+\)/gi;
  const hslRe = /hsla?\([^)]+\)/gi;
  const namedRe =
    /\b(black|white|red|green|blue|yellow|orange|gray|grey|silver|navy|teal|aqua|purple|maroon)\b/gi;

  let m: RegExpExecArray | null;
  while ((m = hexRe.exec(fragment)) !== null) tokens.push(m[0]);
  while ((m = rgbRe.exec(fragment)) !== null) tokens.push(m[0]);
  while ((m = hslRe.exec(fragment)) !== null) tokens.push(m[0]);
  while ((m = namedRe.exec(fragment)) !== null) tokens.push(m[0]);

  return tokens;
}

const COLOR_PROPERTIES =
  /^(color|background|background-color|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline-color|fill|stroke|text-decoration-color|column-rule-color|caret-color)$/i;

function selectorWeight(selector: string): number {
  const s = selector.toLowerCase();
  let w = 1;
  if (/(button|btn|cta|submit|action|primary|brand|logo|nav|header|menu|tab|link|active|hover)/.test(s)) {
    w += 4;
  }
  if (/\.(btn|button|cta|primary|brand|header|nav)/.test(s)) w += 3;
  if (/#/.test(s)) w += 1;
  return w;
}

function propertyWeight(prop: string): number {
  const p = prop.toLowerCase();
  if (p === "background-color" || p === "background") return 2;
  if (p === "color" || p === "border-color" || p === "fill") return 1.5;
  return 1;
}

function textSelectorBoost(selector: string): number {
  const s = selector.toLowerCase();
  if (isButtonSelector(s)) return 0.15;
  if (/(^|[\s>+~(])(body|html|p|h[1-6]|a|label|span|li|td|th|article|main|section|nav|footer|header)([\s.:#[,>+~]|$)/.test(s)) {
    return 2.8;
  }
  if (/(text|copy|paragraph|heading|typography|content|prose|label)/.test(s)) return 2.2;
  return 1;
}

function isButtonSelector(selector: string): boolean {
  const s = selector.toLowerCase();
  if (/(^|[\s>+~(])(button|btn|cta|submit|action)([\s.:#[,>+~]|$)/.test(s)) return true;
  if (/\.(btn|button|cta|primary|secondary)(?![_-]?(bg|background|fill))/i.test(s)) return true;
  if (/\[type\s*=\s*['"]?(submit|button)['"]?\]/i.test(s)) return true;
  return false;
}

function buttonTextSelectorBoost(selector: string): number {
  return isButtonSelector(selector) ? 3.2 : 0.12;
}

function headingTextSelectorBoost(selector: string): number {
  const s = selector.toLowerCase();
  if (/(^|[\s>+~(])(h[1-6])([\s.:#[,>+~]|$)/.test(s)) return 4.2;
  if (/\b(title|headline|heading|logo|brand-mark|wordmark|tagline)\b/.test(s)) return 3.4;
  return 0;
}

function cleanupSelectorForCheerio(selector: string): string {
  // Remove pseudo states/elements and unsupported construct fragments
  return selector
    .replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "")
    .replace(/\[[^\]]*:[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

class DomPresenceIndex {
  private readonly $: cheerio.CheerioAPI | null;

  constructor(html?: string) {
    this.$ = html ? cheerio.load(html) : null;
  }

  count(selector: string): number {
    if (!this.$) return 1;
    const cleaned = cleanupSelectorForCheerio(selector);
    if (!cleaned) return 0;

    let total = 0;
    for (const part of cleaned.split(",")) {
      const s = part.trim();
      if (!s) continue;
      try {
        total += this.$(s).length;
      } catch {
        // Unsupported selector in cheerio
      }
    }
    return total;
  }
}

function presenceWeight(matchCount: number): number {
  // 0 => very weak evidence (defined but not used in current page DOM)
  if (matchCount <= 0) return 0.08;
  // cap to avoid huge pages skewing everything
  return Math.min(10, 1 + Math.log2(matchCount + 1));
}

export function extractColorsFromCss(
  css: string,
  variables: Map<string, string>,
  html?: string,
  renderedSignals?: Record<string, number>,
): Map<string, ColorUsage> {
  const map = new Map<string, ColorUsage>();
  const domIndex = new DomPresenceIndex(html);

  const register = (rawToken: string, weight: number, context = "") => {
    const resolved = resolveCssColor(rawToken, variables);
    const isSemantic = context ? isSemanticColorContext(context) : false;
    const effectiveWeight = isSemantic ? weight * 0.12 : weight;

    for (const token of extractColorTokens(resolved)) {
      const hex = normalizeColorToHex(token);
      if (!hex) continue;
      const hsl = parseColorToHsl(hex);
      if (!hsl) continue;

      const stockKeyword = isStockCssKeywordColor(hex);
      const weightForEntry = stockKeyword ? effectiveWeight * 0.04 : effectiveWeight;

      const existing = map.get(hex);
      if (existing) {
        existing.count += 1;
        existing.score += weightForEntry;
        if (isSemantic) existing.semanticWeight += weight;
      } else {
        map.set(hex, {
          hex,
          hsl,
          count: 1,
          score: weightForEntry,
          semanticWeight: isSemantic ? weight : 0,
          textScore: 0,
          buttonTextScore: 0,
          headingTextScore: 0,
        });
      }
    }
  };

  // Rule-based scan (selector context weighting)
  const ruleRe = /([^{}@/][^{}]*)\{([^{}]*)\}/g;
  let ruleMatch: RegExpExecArray | null;
  while ((ruleMatch = ruleRe.exec(css)) !== null) {
    const selector = ruleMatch[1] ?? "";
    const body = ruleMatch[2] ?? "";
    const sWeight =
      selectorWeight(selector) * presenceWeight(domIndex.count(selector));

    const declRe = /([a-zA-Z-]+)\s*:\s*([^;}{]+)/g;
    let declMatch: RegExpExecArray | null;
    while ((declMatch = declRe.exec(body)) !== null) {
      const prop = declMatch[1] ?? "";
      const val = declMatch[2] ?? "";
      if (!COLOR_PROPERTIES.test(prop)) continue;
      const weight = sWeight * propertyWeight(prop);
      register(val, weight, selector);

      if (prop.toLowerCase() === "color") {
        const isSemanticSel = isSemanticColorContext(selector);
        const base = isSemanticSel ? weight * 0.12 : weight;
        const resolved = resolveCssColor(val, variables);
        for (const token of extractColorTokens(resolved)) {
          const hex = normalizeColorToHex(token);
          if (!hex) continue;
          const entry = map.get(hex);
          if (!entry) continue;
          if (isButtonSelector(selector)) {
            entry.buttonTextScore += base * buttonTextSelectorBoost(selector);
          } else {
            entry.textScore += base * textSelectorBoost(selector);
          }
          const headingBoost = headingTextSelectorBoost(selector);
          if (headingBoost > 0) entry.headingTextScore += base * headingBoost;
        }
      }
    }
  }

  // Variable declarations that are colors
  for (const [name, value] of variables.entries()) {
    register(value, 2, name);
  }

  // Global fallback scan for any missed hex/rgb/hsl literals
  for (const token of extractColorTokens(css)) {
    register(token, 0.25);
  }

  // Runtime-rendered signal (above-the-fold) from optional headless probe
  if (renderedSignals) {
    for (const [hexRaw, strength] of Object.entries(renderedSignals)) {
      const hex = normalizeColorToHex(hexRaw);
      if (!hex) continue;
      const hsl = parseColorToHsl(hex);
      if (!hsl) continue;
      const existing = map.get(hex);
      const bonus = Math.max(0, strength) * 0.5;
      if (existing) {
        existing.count += Math.max(1, Math.round(strength / 4));
        existing.score += bonus;
      } else {
        map.set(hex, {
          hex,
          hsl,
          count: Math.max(1, Math.round(strength / 4)),
          score: bonus,
          semanticWeight: 0,
          textScore: 0,
          buttonTextScore: 0,
          headingTextScore: 0,
        });
      }
    }
  }

  return map;
}

export { isButtonSelector };

/** Exact values of CSS named-color keywords — rarely real brand tokens. */
const STOCK_NAMED_COLOR_HEX = new Set(
  [
    "#FF0000",
    "#0000FF",
    "#008000",
    "#00FF00",
    "#FFFF00",
    "#FFA500",
    "#800080",
    "#00FFFF",
    "#000080",
    "#800000",
    "#008080",
    "#808080",
    "#C0C0C0",
  ].map((h) => h.toUpperCase()),
);

export function isStockCssKeywordColor(hex: string): boolean {
  return STOCK_NAMED_COLOR_HEX.has(hex.toUpperCase());
}

export function isNeutralColor(hsl: { h: number; s: number; l: number }): boolean {
  return hsl.s < 12 || hsl.l <= 8 || hsl.l >= 94;
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
