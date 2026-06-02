import * as cheerio from 'cheerio';
import { c as canUsePlaywright, m as maxStylesheetFetches, f as fetchTimeoutMs, T as THEME_INSPECTOR_USER_AGENT, n as normalizeTargetUrl, i as isUrlAllowedForServerFetch, p as probeRenderedColorsWithTimeout, a as analyzeProbeTimeoutMs, b as isVercelServerless } from './urlSafety_BT_XEDha.mjs';

function normalizeCssValue(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").trim();
}
function extractAllCustomProperties(cssText) {
  const variables = /* @__PURE__ */ new Map();
  const declRe = /(--[A-Za-z0-9_-]+)\s*:\s*([^;}{]+)\s*;/g;
  let declMatch;
  while ((declMatch = declRe.exec(cssText)) !== null) {
    const name = declMatch[1].trim();
    const value = normalizeCssValue(declMatch[2]);
    if (name && value) variables.set(name, value);
  }
  return variables;
}
function countVariableUsage(cssText, varName) {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const baseRe = new RegExp(`var\\(\\s*${escaped}\\s*\\)`, "g");
  return cssText.match(baseRe)?.length ?? 0;
}

const MAX_INLINE_STYLE_NODES = 400;
const MAX_CSS_BYTES = 2e6;
async function fetchText(url, init) {
  const timeoutMs = fetchTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": THEME_INSPECTOR_USER_AGENT,
        accept: "*/*",
        ...init?.headers ?? {}
      },
      redirect: "follow"
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}
function inlineStyleRule(index, attr) {
  return `/* inline-style */ .inline-${index} { ${attr} }`;
}
async function collectWithBrowser(targetUrl) {
  const playwright = await import('./playwright_CczXddnS.mjs');
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: THEME_INSPECTOR_USER_AGENT,
      locale: "es-ES"
    });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 2e4 });
    await page.waitForTimeout(1200);
    const html = await page.content();
    const domData = await page.evaluate((rulePrefix) => {
      const inlineCss = [];
      document.querySelectorAll("style").forEach((el) => {
        const content = el.textContent || "";
        if (content.trim()) inlineCss.push(content);
      });
      const cssHrefs = [];
      document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
        const href = el.href;
        if (href) cssHrefs.push(href);
      });
      document.querySelectorAll("[style]").forEach((el, i) => {
        const attr = el.getAttribute("style");
        if (attr && attr.trim()) {
          inlineCss.push(`${rulePrefix} .inline-${i} { ${attr} }`);
        }
      });
      return { inlineCss, cssHrefs };
    }, "/* inline-style */");
    const cssFromLinks = await Promise.all(
      domData.cssHrefs.map(async (href) => {
        try {
          const res = await context.request.get(href, {
            timeout: 15e3,
            headers: { accept: "text/css,*/*;q=0.9" }
          });
          if (!res.ok()) return "";
          return await res.text();
        } catch {
          return "";
        }
      })
    );
    return {
      html,
      inlineCss: [...domData.inlineCss, ...cssFromLinks.filter(Boolean)],
      cssHrefs: domData.cssHrefs
    };
  } finally {
    await browser.close();
  }
}
async function collectCssFromPage(targetUrl) {
  let html = "";
  let inlineCss = [];
  let cssHrefs = [];
  try {
    html = await fetchText(targetUrl, {
      headers: { accept: "text/html,application/xhtml+xml" }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/\(403\)/.test(msg)) throw err;
    if (!canUsePlaywright()) {
      throw new Error(
        "El sitio bloqueó la descarga directa (403). En Vercel no hay navegador headless; prueba otra URL o ejecuta el proyecto en local."
      );
    }
    const browserCollected = await collectWithBrowser(targetUrl);
    html = browserCollected.html;
    inlineCss = browserCollected.inlineCss;
    cssHrefs = browserCollected.cssHrefs;
  }
  const $ = cheerio.load(html);
  if (inlineCss.length === 0) {
    $("style").each((_i, el) => {
      const content = $(el).text();
      if (content && content.trim()) inlineCss.push(content);
    });
  }
  let inlineStyleCount = 0;
  $("[style]").each((_i, el) => {
    if (inlineStyleCount >= MAX_INLINE_STYLE_NODES) return;
    const attr = $(el).attr("style");
    if (attr && attr.trim()) {
      inlineCss.push(inlineStyleRule(inlineStyleCount, attr));
      inlineStyleCount += 1;
    }
  });
  if (cssHrefs.length === 0) {
    $('link[rel="stylesheet"]').each((_i, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      try {
        cssHrefs.push(new URL(href, targetUrl).toString());
      } catch {
      }
    });
  }
  const hrefLimit = maxStylesheetFetches();
  const limitedHrefs = cssHrefs.slice(0, hrefLimit);
  const externalCssTexts = await Promise.all(
    limitedHrefs.map(async (href) => {
      try {
        return await fetchText(href, { headers: { accept: "text/css,*/*;q=0.9" } });
      } catch {
        return "";
      }
    })
  );
  let combinedCss = [...inlineCss, ...externalCssTexts.filter(Boolean)].join("\n\n");
  if (combinedCss.length > MAX_CSS_BYTES) {
    combinedCss = combinedCss.slice(0, MAX_CSS_BYTES);
  }
  const variables = extractAllCustomProperties(combinedCss);
  return {
    css: combinedCss,
    html,
    variables,
    stylesheetCount: limitedHrefs.length + (inlineCss.length > 0 ? 1 : 0)
  };
}

function parseHexColor(input) {
  const raw = input.trim();
  if (!raw.startsWith("#")) return null;
  const hex = raw.slice(1);
  if (![3, 4, 6, 8].includes(hex.length)) return null;
  const expand = (h) => h + h;
  let rHex = "";
  let gHex = "";
  let bHex = "";
  if (hex.length === 3 || hex.length === 4) {
    rHex = expand(hex[0]);
    gHex = expand(hex[1]);
    bHex = expand(hex[2]);
  } else {
    rHex = hex.slice(0, 2);
    gHex = hex.slice(2, 4);
    bHex = hex.slice(4, 6);
  }
  const r = Number.parseInt(rHex, 16);
  const g = Number.parseInt(gHex, 16);
  const b = Number.parseInt(bHex, 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}
function parseRgbColor(input) {
  const raw = input.trim().toLowerCase();
  const m = raw.match(
    /^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(?:\s*,\s*([0-9.]+)\s*)?\)$/
  );
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if ([r, g, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return { r, g, b };
}
function rgbToHsl(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  if (delta !== 0) {
    switch (max) {
      case r:
        h = (g - b) / delta % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}
function parseColorToHsl(input) {
  const hex = parseHexColor(input);
  if (hex) return rgbToHsl(hex);
  const rgb = parseRgbColor(input);
  if (rgb) return rgbToHsl(rgb);
  const hslMatch = input.trim().toLowerCase().match(/^hsla?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%/);
  if (hslMatch) {
    return {
      h: Number(hslMatch[1]),
      s: Number(hslMatch[2]),
      l: Number(hslMatch[3])
    };
  }
  return null;
}

function categorizeVariable(name, value) {
  const n = name.toLowerCase();
  const v = value.toLowerCase();
  if (parseColorToHsl(value) || /^#([0-9a-f]{3,8})$/i.test(value.trim()) || /^rgba?\(/.test(v) || /^hsla?\(/.test(v) || /(color|colour|bg|background|fill|stroke|accent|brand|primary|secondary|neutral|gray|grey|palette|tint|shade)/.test(
    n
  )) {
    return "color";
  }
  if (/(font|typography|line-height|letter-spacing|leading|tracking|text-size|fs-)/.test(n)) {
    return "typography";
  }
  if (/(shadow|elevation|drop-shadow)/.test(n) || /box-shadow/.test(v)) {
    return "shadow";
  }
  if (/(radius|rounded|corner)/.test(n) || /\d+(px|rem|em|%)\s*\/\s*\d+(px|rem|em|%)/.test(v)) {
    return "radius";
  }
  if (/(duration|ease|transition|animation|motion)/.test(n)) {
    return "animation";
  }
  if (/(space|spacing|gap|margin|padding|inset|size|width|height|grid|column|row|breakpoint|container)/.test(n)) {
    return "spacing";
  }
  if (/(z-index|layout|grid|flex|breakpoint|viewport|sidebar|header-height)/.test(n)) {
    return "layout";
  }
  if (/\d+(\.\d+)?(px|rem|em|%|ch|vw|vh)\b/.test(v) && /(size|space|gap|padding|margin)/.test(n)) {
    return "spacing";
  }
  return "other";
}

function computeCssStats(css, stylesheetCount) {
  const rules = (css.match(/\{[^{}]*\}/g) ?? []).length;
  const selectors = (css.match(/[^{}@]+(?=\{)/g) ?? []).filter((s) => s.trim().length > 0).length;
  const declarations = (css.match(/[a-zA-Z-]+\s*:\s*[^;}{]+;/g) ?? []).length;
  const customPropertyDeclarations = (css.match(/(--[A-Za-z0-9_-]+)\s*:/g) ?? []).length;
  const varReferences = (css.match(/var\(\s*--[A-Za-z0-9_-]+/g) ?? []).length;
  return {
    rules,
    selectors,
    declarations,
    customPropertyDeclarations,
    varReferences,
    stylesheets: stylesheetCount,
    cssSizeBytes: new TextEncoder().encode(css).length
  };
}

function isDeclaredBrandTokenName(name) {
  const lower = name.toLowerCase();
  if (/\bbrand\b/.test(lower) || /--[a-z0-9-]*brand[a-z0-9-]*\b/.test(lower)) {
    return true;
  }
  if (/(^|[-_])(primary|secondary)(?:[-_]|$)/.test(lower) && /color|colour|bg|fill/.test(lower)) {
    return true;
  }
  return false;
}
function getBrandTokenSemanticHint(name) {
  const lower = name.toLowerCase();
  if (!isDeclaredBrandTokenName(lower)) return null;
  if (/\b(error|danger|destructive|invalid|fail|negative)\b/.test(lower)) return "error";
  if (/\b(success|valid|positive|ok)\b/.test(lower)) return "success";
  if (/\b(warning|warn|caution)\b/.test(lower)) return "warning";
  if (/\b(info|notice|informational)\b/.test(lower)) return "info";
  if (/\b(copper-red|brand-red|alert-red|signal-red)\b/.test(lower)) return "error";
  return null;
}
function getTokenRoleHint(name) {
  const lower = name.toLowerCase();
  if (/\b(foreground|text|copy|on-)\b/.test(lower)) return null;
  if (/\b(primary|main|deepblue|navy|midnight|brand-blue|lhdeepblue)\b/.test(lower) && !/\b(yellow|red|error|warning|success|secondary)\b/.test(lower)) {
    return "primary";
  }
  if (/\b(secondary|accent|lhyellow|sunglow|brand-yellow|gold)\b/.test(lower) && !/\b(error|danger|red|copper|invalid)\b/.test(lower)) {
    return "secondary";
  }
  return null;
}

const SEMANTIC_NAME_RE = /\b(error|errors|err|danger|destructive|invalid|failure|failed|fail|alert-danger|negative|success|successful|valid|ok|positive|warning|warnings|warn|caution|info|informational|notice|critical|required|feedback|status|validation|form-error|field-error|toast|banner-error|message-error|message-warning|message-success|message-info|semantic)\b/i;
const SEMANTIC_SEGMENT_RE = /(?:^|[-_/])(error|err|danger|destructive|invalid|fail|warning|warn|caution|success|valid|info|notice|critical|negative|positive)(?:[-_/]|$)/i;
function isSemanticColorContext(text) {
  const t = text.toLowerCase();
  if (SEMANTIC_SEGMENT_RE.test(t)) return true;
  if (SEMANTIC_NAME_RE.test(t)) {
    if (/\b(primary|brand|logo|main|secondary|accent|klm|airline)\b/i.test(t)) return false;
    return true;
  }
  return false;
}
function isFeedbackChromaticColor(hsl) {
  if ((hsl.h <= 30 || hsl.h >= 345) && hsl.s >= 28 && hsl.l >= 20 && hsl.l <= 62) {
    return true;
  }
  if (hsl.h >= 100 && hsl.h <= 155 && hsl.s >= 40 && hsl.l >= 18 && hsl.l <= 52) {
    return true;
  }
  return false;
}
function collectSemanticHexesFromVariables(variables, resolve, toHex) {
  const out = /* @__PURE__ */ new Set();
  for (const [name, value] of variables.entries()) {
    if (!isSemanticColorContext(name)) continue;
    const resolved = resolve(value);
    const hex = toHex(resolved);
    if (hex) out.add(hex.toUpperCase());
    for (const m of resolved.matchAll(/#(?:[0-9a-fA-F]{3,8})\b/g)) {
      const h = toHex(m[0]);
      if (h) out.add(h.toUpperCase());
    }
  }
  return out;
}
function collectSemanticHexesFromCssRules(css, variables, resolve, toHex) {
  const out = /* @__PURE__ */ new Set();
  const ruleRe = /([^{}@/][^{}]*)\{([^{}]*)\}/g;
  let ruleMatch;
  while ((ruleMatch = ruleRe.exec(css)) !== null) {
    const selector = ruleMatch[1] ?? "";
    if (!isSemanticColorContext(selector) && !/\b(alert|notification|toast|snackbar|banner-message)\b/i.test(selector)) {
      continue;
    }
    const body = ruleMatch[2] ?? "";
    for (const m of body.matchAll(/#(?:[0-9a-fA-F]{3,8})\b/gi)) {
      const h = toHex(m[0]);
      if (h) out.add(h.toUpperCase());
    }
    for (const m of body.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      const v = variables.get(m[1]);
      if (!v) continue;
      const h = toHex(resolve(v));
      if (h) out.add(h.toUpperCase());
    }
  }
  return out;
}

const NAMED_COLORS = {
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
  transparent: ""
};
function hslToRgb(h, s, l) {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(h / 60 % 2 - 1));
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
    b: Math.round((b + m) * 255)
  };
}
function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const h = (n) => clamp(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}
function normalizeColorToHex(input) {
  const raw = input.trim();
  if (!raw || raw === "inherit" || raw === "currentcolor" || raw === "transparent") return null;
  const named = NAMED_COLORS[raw.toLowerCase()];
  if (named !== void 0) {
    if (!named) return null;
    return named.toUpperCase();
  }
  const hex = parseHexColor(raw);
  if (hex) return rgbToHex(hex.r, hex.g, hex.b);
  const rgb = parseRgbColor(raw);
  if (rgb) return rgbToHex(rgb.r, rgb.g, rgb.b);
  const hslMatch = raw.toLowerCase().match(/^hsla?\(\s*([0-9.]+)(?:deg)?\s*,?\s*([0-9.]+)%\s*,?\s*([0-9.]+)%/);
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    const rgbFromHsl = hslToRgb(h, s, l);
    return rgbToHex(rgbFromHsl.r, rgbFromHsl.g, rgbFromHsl.b);
  }
  const hslMatchSpace = raw.toLowerCase().match(/^hsla?\(\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%/);
  if (hslMatchSpace) {
    const h = Number(hslMatchSpace[1]);
    const s = Number(hslMatchSpace[2]);
    const l = Number(hslMatchSpace[3]);
    const rgbFromHsl = hslToRgb(h, s, l);
    return rgbToHex(rgbFromHsl.r, rgbFromHsl.g, rgbFromHsl.b);
  }
  return null;
}
function resolveCssColor(value, variables, depth = 0) {
  if (depth > 6) return value.trim();
  let v = value.trim();
  const varRe = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^)]+))?\s*\)/g;
  v = v.replace(varRe, (_m, name, fallback) => {
    const fromMap = variables.get(name);
    if (fromMap) return resolveCssColor(fromMap, variables, depth + 1);
    if (fallback) return resolveCssColor(fallback.trim(), variables, depth + 1);
    return "";
  });
  return v.trim();
}
function extractColorTokens(fragment) {
  const tokens = [];
  const hexRe = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  const rgbRe = /rgba?\([^)]+\)/gi;
  const hslRe = /hsla?\([^)]+\)/gi;
  const namedRe = /\b(black|white|red|green|blue|yellow|orange|gray|grey|silver|navy|teal|aqua|purple|maroon)\b/gi;
  let m;
  while ((m = hexRe.exec(fragment)) !== null) tokens.push(m[0]);
  while ((m = rgbRe.exec(fragment)) !== null) tokens.push(m[0]);
  while ((m = hslRe.exec(fragment)) !== null) tokens.push(m[0]);
  while ((m = namedRe.exec(fragment)) !== null) tokens.push(m[0]);
  return tokens;
}
const COLOR_PROPERTIES = /^(color|background|background-color|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline-color|fill|stroke|text-decoration-color|column-rule-color|caret-color)$/i;
function selectorWeight(selector) {
  const s = selector.toLowerCase();
  let w = 1;
  if (/(button|btn|cta|submit|action|primary|brand|logo|nav|header|menu|tab|link|active|hover)/.test(s)) {
    w += 4;
  }
  if (/\.(btn|button|cta|primary|brand|header|nav)/.test(s)) w += 3;
  if (/#/.test(s)) w += 1;
  return w;
}
function propertyWeight(prop) {
  const p = prop.toLowerCase();
  if (p === "background-color" || p === "background") return 2;
  if (p === "color" || p === "border-color" || p === "fill") return 1.5;
  return 1;
}
function textSelectorBoost(selector) {
  const s = selector.toLowerCase();
  if (isButtonSelector(s)) return 0.15;
  if (/(^|[\s>+~(])(body|html|p|h[1-6]|a|label|span|li|td|th|article|main|section|nav|footer|header)([\s.:#[,>+~]|$)/.test(s)) {
    return 2.8;
  }
  if (/(text|copy|paragraph|heading|typography|content|prose|label)/.test(s)) return 2.2;
  return 1;
}
function isButtonSelector(selector) {
  const s = selector.toLowerCase();
  if (/(^|[\s>+~(])(button|btn|cta|submit|action)([\s.:#[,>+~]|$)/.test(s)) return true;
  if (/\.(btn|button|cta|primary|secondary)(?![_-]?(bg|background|fill))/i.test(s)) return true;
  if (/\[type\s*=\s*['"]?(submit|button)['"]?\]/i.test(s)) return true;
  return false;
}
function buttonTextSelectorBoost(selector) {
  return isButtonSelector(selector) ? 3.2 : 0.12;
}
function cleanupSelectorForCheerio(selector) {
  return selector.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").replace(/\[[^\]]*:[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}
class DomPresenceIndex {
  $;
  constructor(html) {
    this.$ = html ? cheerio.load(html) : null;
  }
  count(selector) {
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
      }
    }
    return total;
  }
}
function presenceWeight(matchCount) {
  if (matchCount <= 0) return 0.08;
  return Math.min(10, 1 + Math.log2(matchCount + 1));
}
function extractColorsFromCss(css, variables, html, renderedSignals) {
  const map = /* @__PURE__ */ new Map();
  const domIndex = new DomPresenceIndex(html);
  const register = (rawToken, weight, context = "") => {
    const resolved = resolveCssColor(rawToken, variables);
    const isSemantic = context ? isSemanticColorContext(context) : false;
    const effectiveWeight = isSemantic ? weight * 0.12 : weight;
    for (const token of extractColorTokens(resolved)) {
      const hex = normalizeColorToHex(token);
      if (!hex) continue;
      const hsl = parseColorToHsl(hex);
      if (!hsl) continue;
      const existing = map.get(hex);
      if (existing) {
        existing.count += 1;
        existing.score += effectiveWeight;
        if (isSemantic) existing.semanticWeight += weight;
      } else {
        map.set(hex, {
          hex,
          hsl,
          count: 1,
          score: effectiveWeight,
          semanticWeight: isSemantic ? weight : 0,
          textScore: 0,
          buttonTextScore: 0
        });
      }
    }
  };
  const ruleRe = /([^{}@/][^{}]*)\{([^{}]*)\}/g;
  let ruleMatch;
  while ((ruleMatch = ruleRe.exec(css)) !== null) {
    const selector = ruleMatch[1] ?? "";
    const body = ruleMatch[2] ?? "";
    const sWeight = selectorWeight(selector) * presenceWeight(domIndex.count(selector));
    const declRe = /([a-zA-Z-]+)\s*:\s*([^;}{]+)/g;
    let declMatch;
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
        }
      }
    }
  }
  for (const [name, value] of variables.entries()) {
    register(value, 2, name);
  }
  for (const token of extractColorTokens(css)) {
    register(token, 0.25);
  }
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
          buttonTextScore: 0
        });
      }
    }
  }
  return map;
}
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
    "#C0C0C0"
  ].map((h) => h.toUpperCase())
);
function isStockCssKeywordColor(hex) {
  return STOCK_NAMED_COLOR_HEX.has(hex.toUpperCase());
}
function isNeutralColor(hsl) {
  return hsl.s < 12 || hsl.l <= 8 || hsl.l >= 94;
}
function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function mergeSemanticHexSets(...sets) {
  const out = /* @__PURE__ */ new Set();
  for (const s of sets) for (const h of s) out.add(h);
  return out;
}
const VISIBLE_BRAND_ROLE_THRESHOLD = 0.05;
function shouldExcludeFromBrandRoles(c, semanticHexes, renderedNorm, tokenSemanticHintByHex) {
  const vn = renderedNorm(c.hex);
  if (vn >= VISIBLE_BRAND_ROLE_THRESHOLD) return false;
  const tokenHint = tokenSemanticHintByHex.get(c.hex.toUpperCase());
  if (tokenHint) return true;
  if (semanticHexes.has(c.hex.toUpperCase())) return true;
  if (isFeedbackChromaticColor(c.hsl) && c.semanticWeight > 0) return true;
  if (c.semanticWeight <= 0) return false;
  return c.semanticWeight >= 5 && c.semanticWeight >= c.score * 0.28;
}
function colorUsageFromHintHex(hex, extracted) {
  const normalized = normalizeColorToHex(hex);
  if (!normalized) return null;
  const existing = extracted.get(normalized);
  if (existing) return existing;
  const hsl = parseColorToHsl(normalized);
  if (!hsl) return null;
  return {
    hex: normalized,
    hsl,
    count: 1,
    score: 120,
    semanticWeight: 0,
    textScore: 0,
    buttonTextScore: 0
  };
}
function buildDeclaredBrandTokens(variablesMap, css, resolve, renderedNorm) {
  const tokens = [];
  const tokenSemanticHintByHex = /* @__PURE__ */ new Map();
  const tokenRoleHintByHex = /* @__PURE__ */ new Map();
  for (const [name, value] of variablesMap.entries()) {
    if (!isDeclaredBrandTokenName(name)) continue;
    const hex = normalizeColorToHex(resolve(value));
    if (!hex) continue;
    const hsl = parseColorToHsl(hex);
    if (!hsl || isNeutralColor(hsl)) continue;
    const upper = hex.toUpperCase();
    const visibleWeight = Math.round(renderedNorm(hex) * 100);
    const semanticHint = getBrandTokenSemanticHint(name);
    const roleHint = getTokenRoleHint(name);
    tokens.push({
      name,
      hex,
      hsl,
      usage: countVariableUsage(css, name),
      semanticHint,
      roleHint,
      visibleWeight,
      usedOnScreen: visibleWeight > 3
    });
    if (semanticHint && !tokenSemanticHintByHex.has(upper)) {
      tokenSemanticHintByHex.set(upper, semanticHint);
    }
    if (roleHint && !tokenRoleHintByHex.has(upper)) {
      tokenRoleHintByHex.set(upper, roleHint);
    }
  }
  tokens.sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));
  return { tokens, tokenSemanticHintByHex, tokenRoleHintByHex };
}
function isAnalogousHue(primaryH, candidateH, maxDistance = 55) {
  const d = hueDistance(primaryH, candidateH);
  return d >= 6 && d <= maxDistance;
}
function isInstitutionalCoolPrimary(hsl) {
  return hsl.h >= 185 && hsl.h <= 255 && hsl.l <= 48 && hsl.s >= 35;
}
function isGoldYellowAccent(hsl) {
  return hsl.h >= 32 && hsl.h <= 68 && hsl.s >= 45 && hsl.l >= 30 && hsl.l <= 72;
}
function isSecondaryBrandVariableName(name) {
  const lower = name.toLowerCase();
  if (isSemanticColorContext(lower)) return false;
  if (/\bprimary\b/.test(lower) && !/(secondary|secundario)/.test(lower)) return false;
  if (/(menu_|megamenu|row_|cell_|hover|focus|selection|highlighted)/.test(lower)) {
    return false;
  }
  if (/(?:^|[-_])(secondary|secundario|complement)(?:[-_]|$)/.test(lower)) return true;
  if (/(?:^|[-_])brand[-_]?(secondary|accent|highlight)(?:[-_]|$)/.test(lower)) {
    return true;
  }
  return false;
}
function isTextBrandVariableName(name) {
  const lower = name.toLowerCase();
  if (isSemanticColorContext(lower)) return false;
  if (/(background|border|shadow|outline|icon|logo|menu|highlight)/.test(lower)) return false;
  if (/(?:^|[-_])(text|foreground|copy|body-text|font-color|color-text)(?:[-_]|$)/.test(lower)) {
    return true;
  }
  return false;
}
function collectTextHintHexes(variablesMap, resolve) {
  const out = /* @__PURE__ */ new Set();
  for (const [name, value] of variablesMap.entries()) {
    if (!isTextBrandVariableName(name)) continue;
    const hex = normalizeColorToHex(resolve(value));
    if (hex) out.add(hex.toUpperCase());
  }
  return out;
}
function isButtonTextVariableName(name) {
  const lower = name.toLowerCase();
  if (isSemanticColorContext(lower)) return false;
  if (/(?:^|[-_])(button-text|btn-text|cta-text|button-color|btn-color|on-primary|on-secondary|primary-foreground|secondary-foreground)(?:[-_]|$)/.test(
    lower
  )) {
    return true;
  }
  if (/(foreground-on-|text-on-|color-on-)(primary|secondary|button|cta|brand)/.test(lower)) {
    return true;
  }
  return false;
}
function collectButtonTextHintHexes(variablesMap, resolve) {
  const out = /* @__PURE__ */ new Set();
  for (const [name, value] of variablesMap.entries()) {
    if (!isButtonTextVariableName(name)) continue;
    const hex = normalizeColorToHex(resolve(value));
    if (hex) out.add(hex.toUpperCase());
  }
  return out;
}
function collectSecondaryHintHexes(variablesMap, resolve) {
  const out = /* @__PURE__ */ new Set();
  for (const [name, value] of variablesMap.entries()) {
    if (!isSecondaryBrandVariableName(name)) continue;
    const hex = normalizeColorToHex(resolve(value));
    if (hex) out.add(hex.toUpperCase());
  }
  return out;
}
function brandColorBoost(hsl) {
  let boost = 0;
  if (hsl.h >= 38 && hsl.h <= 68 && hsl.s >= 70 && hsl.l >= 32 && hsl.l <= 62) {
    boost += 35;
  }
  if (hsl.s >= 55 && hsl.l >= 22 && hsl.l <= 78) {
    boost += 8;
  }
  return boost;
}
function normalizedRenderedMap(signals) {
  const values = Object.values(signals ?? {});
  const max = values.length > 0 ? Math.max(...values) : 0;
  return {
    max,
    norm: (hex) => {
      if (max <= 0) return 0;
      return Math.max(0, Math.min(1, (signals?.[hex] ?? 0) / max));
    }
  };
}
function isCopyTextNeutral(hsl, isDarkTheme) {
  if (isDarkTheme) return hsl.l >= 62;
  if (hsl.l >= 92) return false;
  if (hsl.s < 28 && hsl.l >= 14 && hsl.l <= 52) return true;
  return hsl.s < 10 && hsl.l >= 8 && hsl.l <= 42;
}
function isVividAccentTextColor(hsl) {
  if (hsl.l < 26 || hsl.l > 80) return false;
  return hsl.s >= 38;
}
function pickDominantRenderedTextColor(renderedTextSignals, extracted, isDarkTheme, semanticHexes, renderedText, primary) {
  if (!renderedTextSignals) return null;
  const renderedScore = (entry) => {
    const c = entry.usage;
    let s = entry.weight;
    if (isCopyTextNeutral(c.hsl, isDarkTheme)) s *= 2.8;
    if (isVividAccentTextColor(c.hsl)) s *= 0.12;
    if (primary && entry.hex === primary.hex) s *= 0.08;
    return s;
  };
  const ranked = Object.entries(renderedTextSignals).map(([hex, weight]) => {
    const usage = extracted.get(hex);
    if (!usage || weight <= 0) return null;
    return { hex, weight, usage };
  }).filter((e) => e !== null).sort((a, b) => renderedScore(b) - renderedScore(a));
  for (const entry of ranked) {
    const c = entry.usage;
    if (isStockCssKeywordColor(c.hex)) continue;
    if (semanticHexes.has(c.hex.toUpperCase()) && renderedText.norm(c.hex) < 0.06) continue;
    if (!isDarkTheme && isVividAccentTextColor(c.hsl)) continue;
    if (primary && c.hex === primary.hex) continue;
    if (!isCopyTextNeutral(c.hsl, isDarkTheme) && !isDarkTheme) continue;
    return c;
  }
  return null;
}
function selectTextOnSurface(extracted, options) {
  const { isDarkTheme, primary, textHintHexes, semanticHexes, renderedText } = options;
  const pool = [...extracted.values()].filter((c) => {
    if (isStockCssKeywordColor(c.hex)) return false;
    if (semanticHexes.has(c.hex.toUpperCase()) && renderedText.norm(c.hex) < 0.05) return false;
    if (primary && c.hex === primary.hex) return false;
    if (!isDarkTheme && isVividAccentTextColor(c.hsl)) return false;
    return isCopyTextNeutral(c.hsl, isDarkTheme);
  });
  const lightTextPool = pool.filter((c) => {
    if (isDarkTheme) return true;
    if (c.hex === "#FFFFFF" || c.hex === "#FFF") return false;
    return true;
  });
  const fromHint = lightTextPool.find((c) => textHintHexes.has(c.hex.toUpperCase()));
  if (fromHint) return fromHint;
  const textSelectionScore = (c) => {
    const rt = renderedText.norm(c.hex);
    const hint = textHintHexes.has(c.hex.toUpperCase()) ? 140 : 0;
    const neutralBodyBonus = !isDarkTheme && isCopyTextNeutral(c.hsl, isDarkTheme) ? 90 + rt * 200 : 0;
    const vividAccentPenalty = !isDarkTheme && isVividAccentTextColor(c.hsl) ? -400 : 0;
    const primaryPenalty = primary && c.hex === primary.hex ? -500 : 0;
    const whitePenalty = !isDarkTheme && c.hsl.l >= 92 ? -250 : 0;
    const blackPenalty = !isDarkTheme && c.hsl.s < 8 && c.hsl.l <= 6 ? -40 : 0;
    return c.textScore * 6 + rt * 520 + hint + neutralBodyBonus + vividAccentPenalty + primaryPenalty + whitePenalty + blackPenalty;
  };
  const ranked = [...lightTextPool].sort(
    (a, b) => textSelectionScore(b) - textSelectionScore(a) || b.textScore - a.textScore
  );
  return ranked[0] ?? null;
}
function selectTextOnButton(extracted, options) {
  const {
    buttonFill,
    textOnSurface,
    buttonTextHintHexes,
    semanticHexes,
    renderedButtonText,
    neutrals
  } = options;
  const pool = [...extracted.values()].filter((c) => {
    if (isStockCssKeywordColor(c.hex)) return false;
    if (semanticHexes.has(c.hex.toUpperCase()) && renderedButtonText.norm(c.hex) < 0.05) {
      return false;
    }
    return c.buttonTextScore > 0 || renderedButtonText.norm(c.hex) > 0;
  });
  const fromHint = pool.find((c) => buttonTextHintHexes.has(c.hex.toUpperCase()));
  if (fromHint) return fromHint;
  const fillIsDark = Boolean(buttonFill && buttonFill.hsl.l < 54);
  const fillIsLight = Boolean(buttonFill && buttonFill.hsl.l >= 54);
  const fillIsVividWarm = Boolean(
    buttonFill && buttonFill.hsl.h >= 35 && buttonFill.hsl.h <= 75 && buttonFill.hsl.l >= 38 && buttonFill.hsl.l <= 72
  );
  const contrastPool = pool.filter((c) => {
    if (fillIsVividWarm) return c.hsl.l >= 8 && c.hsl.l <= 40;
    if (fillIsDark) return c.hsl.l >= 62;
    if (fillIsLight) return c.hsl.l <= 42;
    return true;
  });
  const buttonTextSelectionScore = (c) => {
    const rb = renderedButtonText.norm(c.hex);
    const hint = buttonTextHintHexes.has(c.hex.toUpperCase()) ? 130 : 0;
    const contrastBonus = fillIsDark && c.hsl.l >= 78 ? 45 : fillIsLight && c.hsl.l <= 30 ? 45 : 0;
    const surfacePenalty = textOnSurface && c.hex === textOnSurface.hex ? -90 : 18;
    return c.buttonTextScore * 7 + rb * 520 + hint + contrastBonus + surfacePenalty;
  };
  const ranked = [...contrastPool.length > 0 ? contrastPool : pool].sort(
    (a, b) => buttonTextSelectionScore(b) - buttonTextSelectionScore(a) || b.buttonTextScore - a.buttonTextScore
  );
  let pick = ranked[0] ?? null;
  if (pick && textOnSurface && pick.hex === textOnSurface.hex) {
    pick = ranked.find((c) => c.hex !== textOnSurface.hex) ?? pick;
  }
  if (pick) return pick;
  if (fillIsDark) {
    return neutrals.find((c) => c.hsl.l >= 88) ?? [...extracted.values()].find((c) => c.hex === "#FFFFFF") ?? null;
  }
  if (fillIsLight || fillIsVividWarm) {
    return [...extracted.values()].find(
      (c) => c.hsl.l <= 35 && c.hsl.l >= 8 && !isStockCssKeywordColor(c.hex)
    ) ?? neutrals.find((c) => c.hsl.l <= 28 && !isStockCssKeywordColor(c.hex)) ?? null;
  }
  return null;
}
function analyzeThemeFromCss(cssString, variablesMap, html, renderedSignals, renderedTextSignals, renderedButtonTextSignals) {
  const extracted = extractColorsFromCss(cssString, variablesMap, html, renderedSignals);
  const resolveColor = (value) => resolveCssColor(value, variablesMap);
  const semanticHexes = mergeSemanticHexSets(
    collectSemanticHexesFromVariables(variablesMap, resolveColor, normalizeColorToHex),
    collectSemanticHexesFromCssRules(cssString, variablesMap, resolveColor, normalizeColorToHex)
  );
  const secondaryHintHexes = collectSecondaryHintHexes(variablesMap, resolveColor);
  const textHintHexes = collectTextHintHexes(variablesMap, resolveColor);
  const buttonTextHintHexes = collectButtonTextHintHexes(variablesMap, resolveColor);
  const renderedText = normalizedRenderedMap(renderedTextSignals ?? renderedSignals);
  const renderedButtonText = normalizedRenderedMap(renderedButtonTextSignals);
  const renderedScale = (() => {
    const values = Object.values(renderedSignals ?? {});
    if (values.length === 0) return { max: 0, p75: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const max = sorted[sorted.length - 1] ?? 0;
    const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
    return { max, p75 };
  })();
  const renderedNormalized = (hex) => {
    if (!renderedSignals || renderedScale.max <= 0) return 0;
    const v = renderedSignals[hex] ?? 0;
    return Math.max(0, Math.min(1, v / renderedScale.max));
  };
  const { tokens: brandTokens, tokenSemanticHintByHex, tokenRoleHintByHex } = buildDeclaredBrandTokens(variablesMap, cssString, resolveColor, renderedNormalized);
  for (const [name, value] of variablesMap.entries()) {
    const resolved = resolveCssColor(value, variablesMap);
    const hex = normalizeColorToHex(resolved);
    if (!hex) continue;
    const entry = extracted.get(hex);
    if (!entry) continue;
    const lower = name.toLowerCase();
    if (isSemanticColorContext(lower)) {
      semanticHexes.add(hex.toUpperCase());
      continue;
    }
    const rn = renderedNormalized(hex);
    const roleHint = getTokenRoleHint(name);
    const semanticHint = getBrandTokenSemanticHint(name);
    if (isDeclaredBrandTokenName(lower)) {
      if (semanticHint) entry.score += 6;
      else entry.score += 28 + rn * 40;
      if (roleHint === "primary") entry.score += 22 + rn * 35;
      if (roleHint === "secondary") entry.score += 16 + rn * 28;
    } else if (isSecondaryBrandVariableName(lower)) {
      entry.score += 70;
    } else if (/(primary|brand|main|accent)/.test(lower)) {
      entry.score += 80;
    }
    if (isTextBrandVariableName(lower)) entry.textScore += 90;
    if (isButtonTextVariableName(lower)) entry.buttonTextScore += 95;
  }
  for (const entry of extracted.values()) {
    const rt = renderedText.norm(entry.hex);
    if (rt > 0) entry.textScore += rt * 80;
    const rb = renderedButtonText.norm(entry.hex);
    if (rb > 0) entry.buttonTextScore += rb * 85;
    entry.score += brandColorBoost(entry.hsl);
    const rn = renderedNormalized(entry.hex);
    if (rn > 0) {
      entry.score += rn * 220;
      entry.score *= 1 + rn * 0.55;
    } else if (renderedSignals && entry.hsl.s >= 30) {
      entry.score *= 0.62;
    }
    if (renderedSignals && renderedScale.p75 > 0 && (renderedSignals[entry.hex] ?? 0) >= renderedScale.p75) {
      entry.score += 80;
    }
  }
  const ranked = [...extracted.values()].sort((a, b) => b.score - a.score || b.count - a.count);
  const chromatic = ranked.filter((c) => {
    if (isNeutralColor(c.hsl)) return false;
    return !shouldExcludeFromBrandRoles(
      c,
      semanticHexes,
      renderedNormalized,
      tokenSemanticHintByHex
    );
  });
  const neutrals = ranked.filter((c) => isNeutralColor(c.hsl));
  const brandSelectionScore = (c) => {
    const rn = renderedNormalized(c.hex);
    const saturationBonus = Math.max(0, c.hsl.s - 35) * 0.45;
    const vividRangeBonus = c.hsl.l >= 24 && c.hsl.l <= 72 ? 10 : 0;
    const yellowBrandBonus = rn > 0.04 && c.hsl.h >= 38 && c.hsl.h <= 68 && c.hsl.s >= 60 && c.hsl.l >= 28 && c.hsl.l <= 70 ? 10 : 0;
    return c.score * 0.85 + rn * 420 + saturationBonus + vividRangeBonus + yellowBrandBonus;
  };
  const brandPool = chromatic.filter((c) => c.hsl.s >= 30);
  const candidates = [...brandPool.length > 0 ? brandPool : chromatic];
  const hasVisibleInstitutionalNavy = candidates.some(
    (c) => c.hsl.h >= 200 && c.hsl.h <= 255 && c.hsl.l <= 42 && renderedNormalized(c.hex) >= 0.02
  );
  const primarySelectionScore = (c) => {
    const rn = renderedNormalized(c.hex);
    const saturationBonus = Math.max(0, c.hsl.s - 30) * 0.22;
    const readabilityBonus = c.hsl.l >= 16 && c.hsl.l <= 58 ? 8 : 0;
    const tokenHint = tokenRoleHintByHex.get(c.hex.toUpperCase()) === "primary" ? 18 + rn * 45 : 0;
    const navyBrandBoost = hasVisibleInstitutionalNavy && c.hsl.h >= 200 && c.hsl.h <= 255 && c.hsl.l <= 42 ? 130 + rn * 60 : 0;
    const yellowNotPrimaryPenalty = hasVisibleInstitutionalNavy && c.hsl.h >= 32 && c.hsl.h <= 72 ? -90 : 0;
    return c.score * 0.75 + rn * 480 + saturationBonus + readabilityBonus + tokenHint + navyBrandBoost + yellowNotPrimaryPenalty;
  };
  const chromaticRanked = [...candidates].sort(
    (a, b) => brandSelectionScore(b) - brandSelectionScore(a) || b.score - a.score
  );
  const primaryByScore = [...candidates].sort(
    (a, b) => primarySelectionScore(b) - primarySelectionScore(a) || b.score - a.score
  )[0];
  const tokenPrimaryEntry = brandTokens.find(
    (t) => !t.semanticHint && (t.roleHint === "primary" || /(lhdeepblue|deepblue|brand-blue|navy)/i.test(t.name))
  );
  const tokenPrimary = tokenPrimaryEntry ? colorUsageFromHintHex(tokenPrimaryEntry.hex, extracted) : null;
  const primary = (() => {
    if (!primaryByScore && !tokenPrimary) return null;
    if (!tokenPrimary) return primaryByScore ?? null;
    if (!primaryByScore) return tokenPrimary;
    const vnScore = renderedNormalized(primaryByScore.hex);
    const vnToken = renderedNormalized(tokenPrimary.hex);
    if (renderedScale.max <= 0) return tokenPrimary;
    if (isInstitutionalCoolPrimary(tokenPrimary.hsl) && isGoldYellowAccent(primaryByScore.hsl) && vnScore < 0.22) {
      return tokenPrimary;
    }
    if (vnToken >= vnScore * 0.5 || vnToken >= VISIBLE_BRAND_ROLE_THRESHOLD) {
      return tokenPrimary;
    }
    return primaryByScore;
  })();
  const secondaryCandidates = chromaticRanked.filter((c) => {
    if (!primary || c.hex === primary.hex || c.hsl.s < 25 || isStockCssKeywordColor(c.hex)) {
      return false;
    }
    if (tokenSemanticHintByHex.has(c.hex.toUpperCase())) return false;
    const isRedFeedback = (c.hsl.h <= 30 || c.hsl.h >= 345) && isFeedbackChromaticColor(c.hsl);
    if (isRedFeedback) return false;
    return true;
  });
  const pickBest = (list) => list.length > 0 ? [...list].sort(
    (a, b) => brandSelectionScore(b) - brandSelectionScore(a) || b.score - a.score
  )[0] : null;
  const secondarySelectionScore = (c) => {
    const rn = renderedNormalized(c.hex);
    const tokenHint = tokenRoleHintByHex.get(c.hex.toUpperCase()) === "secondary" ? 16 + rn * 40 : 0;
    return brandSelectionScore(c) + tokenHint;
  };
  const fromHint = [...secondaryCandidates].sort((a, b) => secondarySelectionScore(b) - secondarySelectionScore(a)).find(
    (c) => tokenRoleHintByHex.get(c.hex.toUpperCase()) === "secondary" || secondaryHintHexes.has(c.hex.toUpperCase())
  ) ?? null;
  const goldYellowCandidates = secondaryCandidates.filter((c) => isGoldYellowAccent(c.hsl));
  const analogousCandidates = secondaryCandidates.filter(
    (c) => primary && isAnalogousHue(primary.hsl.h, c.hsl.h)
  );
  const secondaryFromCoolPrimary = () => {
    if (!primary || !isInstitutionalCoolPrimary(primary.hsl)) return null;
    const bestGold = pickBest(goldYellowCandidates);
    const bestAnalogous = pickBest(analogousCandidates);
    if (bestGold && !bestAnalogous) return bestGold;
    if (bestGold && bestAnalogous) {
      if (bestGold.count >= 4 || bestGold.score >= bestAnalogous.score * 0.35) {
        return bestGold;
      }
      return bestAnalogous;
    }
    return bestAnalogous;
  };
  const contrastingCandidates = secondaryCandidates.filter(
    (c) => primary && hueDistance(c.hsl.h, primary.hsl.h) >= 25
  );
  const secondary = fromHint ?? secondaryFromCoolPrimary() ?? pickBest(analogousCandidates) ?? pickBest(goldYellowCandidates) ?? pickBest(contrastingCandidates) ?? pickBest(secondaryCandidates) ?? null;
  const lightBg = neutrals.filter((c) => c.hsl.l >= 70).sort((a, b) => b.count - a.count || b.hsl.l - a.hsl.l)[0];
  const darkBg = neutrals.filter((c) => c.hsl.l <= 28).sort((a, b) => b.count - a.count || a.hsl.l - b.hsl.l)[0];
  const backgrounds = [];
  if (lightBg) backgrounds.push(lightBg.hex);
  if (darkBg && darkBg.hex !== lightBg?.hex) backgrounds.push(darkBg.hex);
  const renderedBg = normalizedRenderedMap(renderedSignals);
  const lightRendered = lightBg ? renderedBg.norm(lightBg.hex) : 0;
  const darkRendered = darkBg ? renderedBg.norm(darkBg.hex) : 0;
  const isDarkTheme = (() => {
    if (lightBg && lightBg.hsl.l >= 80) {
      if (renderedBg.max > 0) {
        return darkRendered > Math.max(0.18, lightRendered * 1.28);
      }
      return false;
    }
    if (renderedBg.max > 0) {
      if (lightRendered >= 0.12 && darkRendered < lightRendered * 1.08) return false;
      return darkRendered > Math.max(0.1, lightRendered * 1.12);
    }
    return Boolean(
      darkBg && darkBg.hsl.l <= 12 && lightBg && lightBg.hsl.l < 55 && darkBg.count > lightBg.count * 2.8
    );
  })();
  const forceLightSurface = Boolean(lightBg && lightBg.hsl.l >= 78);
  const surfaceIsDark = forceLightSurface ? false : isDarkTheme;
  const cssTextPick = selectTextOnSurface(extracted, {
    isDarkTheme: surfaceIsDark,
    primary,
    textHintHexes,
    semanticHexes,
    renderedText
  });
  const renderedTextPick = pickDominantRenderedTextColor(
    renderedTextSignals,
    extracted,
    surfaceIsDark,
    semanticHexes,
    renderedText,
    primary
  );
  let textOnSurface = cssTextPick ?? null;
  if (renderedTextPick) {
    const rtRendered = renderedText.norm(renderedTextPick.hex);
    const rtCss = cssTextPick ? renderedText.norm(cssTextPick.hex) : 0;
    const cssIsNeutral = cssTextPick ? isCopyTextNeutral(cssTextPick.hsl, surfaceIsDark) : false;
    const renderedIsAccent = isVividAccentTextColor(renderedTextPick.hsl);
    const preferRendered = !cssTextPick || rtRendered >= rtCss * 1.12 && !renderedIsAccent && (cssIsNeutral || isCopyTextNeutral(renderedTextPick.hsl, surfaceIsDark));
    if (preferRendered) textOnSurface = renderedTextPick;
  }
  if (!textOnSurface) {
    const neutralFallback = [...extracted.values()].filter((c) => isCopyTextNeutral(c.hsl, surfaceIsDark) && !isStockCssKeywordColor(c.hex)).sort(
      (a, b) => renderedText.norm(b.hex) - renderedText.norm(a.hex) || b.textScore - a.textScore || b.count - a.count
    )[0];
    textOnSurface = neutralFallback ?? (surfaceIsDark ? neutrals.filter((c) => c.hsl.l >= 65).sort((a, b) => b.count - a.count)[0] : neutrals.filter((c) => c.hsl.l <= 42 && c.hsl.l >= 14).sort((a, b) => b.count - a.count)[0]) ?? null;
  }
  const textOnButton = selectTextOnButton(extracted, {
    buttonFill: primary,
    textOnSurface,
    buttonTextHintHexes,
    semanticHexes,
    renderedButtonText,
    neutrals
  }) ?? null;
  const roles = /* @__PURE__ */ new Map();
  if (primary) roles.set(primary.hex, "primary");
  if (secondary) roles.set(secondary.hex, "secondary");
  if (lightBg) roles.set(lightBg.hex, "background");
  if (darkBg && darkBg.hex !== lightBg?.hex) roles.set(darkBg.hex, "background");
  if (textOnSurface) roles.set(textOnSurface.hex, "text-surface");
  if (textOnButton && textOnButton.hex !== textOnSurface?.hex) {
    roles.set(textOnButton.hex, "text-button");
  }
  let accentCount = 0;
  for (const c of chromatic) {
    if (accentCount >= 2) break;
    if (roles.has(c.hex)) continue;
    if (c.hsl.s < 35) continue;
    roles.set(c.hex, "accent");
    accentCount++;
  }
  const roleOrder = {
    primary: 0,
    secondary: 1,
    accent: 2,
    background: 3,
    text: 4,
    "text-surface": 4,
    "text-button": 4,
    palette: 5
  };
  const toPaletteColor = (c, source) => {
    const rn = renderedNormalized(c.hex);
    return {
      hex: c.hex,
      usage: c.count,
      score: Math.round(c.score * 10) / 10,
      role: roles.get(c.hex) ?? "palette",
      hsl: c.hsl,
      source,
      visibleWeight: Math.round(rn * 100)
    };
  };
  const chromaticForBrand = ranked.filter(
    (c) => !isNeutralColor(c.hsl) && c.hsl.s >= 25 && !shouldExcludeFromBrandRoles(
      c,
      semanticHexes,
      renderedNormalized,
      tokenSemanticHintByHex
    )
  );
  const brandVisible = chromaticForBrand.filter((c) => renderedNormalized(c.hex) > 0.03 || roles.has(c.hex)).map((c) => toPaletteColor(c, "visible")).sort((a, b) => {
    const ra = roleOrder[a.role ?? "palette"] ?? 5;
    const rb = roleOrder[b.role ?? "palette"] ?? 5;
    if (ra !== rb) return ra - rb;
    return b.visibleWeight - a.visibleWeight || b.score - a.score;
  });
  const visibleHex = new Set(brandVisible.map((c) => c.hex));
  const brandLegacy = chromaticForBrand.filter((c) => !visibleHex.has(c.hex)).slice(0, 24).map((c) => toPaletteColor(c, "legacy")).sort((a, b) => b.usage - a.usage || b.score - a.score);
  const paletteSorted = [...brandVisible, ...brandLegacy].slice(0, 32);
  return {
    primary_color: primary?.hex ?? null,
    secondary_color: secondary?.hex ?? null,
    backgrounds,
    text_on_background: textOnSurface?.hex ?? null,
    text_on_button: textOnButton?.hex ?? null,
    text_color: textOnSurface?.hex ?? null,
    brandTokens,
    brandVisible,
    brandLegacy,
    palette: paletteSorted
  };
}

function buildVariableCatalog(css, variablesMap) {
  const list = [];
  for (const [name, value] of variablesMap.entries()) {
    const hsl = parseColorToHsl(value);
    const isColor = hsl !== null || categorizeVariable(name, value) === "color";
    list.push({
      name,
      value,
      category: isColor ? "color" : categorizeVariable(name, value),
      usage: countVariableUsage(css, name),
      isColor,
      hsl
    });
  }
  return list.sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));
}
function groupByCategory(variables, excludeChromaticHex) {
  const empty = {
    color: [],
    spacing: [],
    typography: [],
    radius: [],
    shadow: [],
    animation: [],
    layout: [],
    other: []
  };
  for (const v of variables) {
    if (v.category === "color" && v.isColor && excludeChromaticHex?.has(v.value.toUpperCase()) && v.hsl && v.hsl.s >= 25) {
      continue;
    }
    empty[v.category].push(v);
  }
  return empty;
}
function mergeDetectedColorsIntoCatalog(variables, theme) {
  const seen = new Set(variables.filter((v) => v.isColor).map((v) => v.value.toUpperCase()));
  const extras = [];
  const paletteForCatalog = [...theme.brandVisible, ...theme.brandLegacy, ...theme.palette];
  for (const p of paletteForCatalog) {
    const hex = p.hex.toUpperCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    const label = p.role && p.role !== "palette" ? `--detected-${p.role}` : `--color-${hex.replace("#", "").toLowerCase()}`;
    extras.push({
      name: label,
      value: p.hex,
      category: "color",
      usage: p.usage,
      isColor: true,
      hsl: p.hsl
    });
  }
  const pushIdentityToken = (hex, role) => {
    if (!hex) return;
    const upper = hex.toUpperCase();
    if (seen.has(upper)) return;
    seen.add(upper);
    extras.push({
      name: `--detected-${role}`,
      value: hex,
      category: "color",
      usage: 0,
      isColor: true,
      hsl: parseColorToHsl(hex)
    });
  };
  pushIdentityToken(theme.text_on_background, "text-surface");
  if (theme.text_on_button && theme.text_on_button !== theme.text_on_background) {
    pushIdentityToken(theme.text_on_button, "text-button");
  }
  return [...variables, ...extras].sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));
}
function buildAnalysisReport(url, css, stylesheetCount, variablesMap, html, renderedSignals, renderedTextSignals, renderedButtonTextSignals) {
  const theme = analyzeThemeFromCss(
    css,
    variablesMap,
    html,
    renderedSignals,
    renderedTextSignals,
    renderedButtonTextSignals
  );
  const variables = mergeDetectedColorsIntoCatalog(buildVariableCatalog(css, variablesMap), theme);
  const brandChromatics = new Set(
    [...theme.brandVisible, ...theme.brandLegacy].map((c) => c.hex.toUpperCase())
  );
  return {
    url,
    analyzedAt: (/* @__PURE__ */ new Date()).toISOString(),
    stats: computeCssStats(css, stylesheetCount),
    theme,
    variables,
    variablesByCategory: groupByCategory(variables, brandChromatics)
  };
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
async function handleAnalyzeRequest(payload) {
  const rawUrl = typeof payload?.url === "string" ? payload.url.trim() : "";
  const url = normalizeTargetUrl(rawUrl);
  if (!url) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: {
        error: "Missing or invalid URL",
        details: "Use a valid domain like https://example.com (http/https)."
      }
    };
  }
  if (!isUrlAllowedForServerFetch(url)) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: {
        error: "URL not allowed",
        details: "No se pueden analizar direcciones locales o redes privadas."
      }
    };
  }
  try {
    const { css, html, variables, stylesheetCount } = await collectCssFromPage(url);
    if (!css.trim() && !html.trim()) {
      return {
        status: 422,
        headers: JSON_HEADERS,
        body: {
          error: "No content to analyze",
          details: "The URL returned no HTML/CSS to inspect."
        }
      };
    }
    const rendered = await probeRenderedColorsWithTimeout(url, analyzeProbeTimeoutMs());
    const report = buildAnalysisReport(
      url,
      css,
      stylesheetCount,
      variables,
      html,
      rendered?.colors,
      rendered?.bodyTextColors ?? rendered?.textColors,
      rendered?.buttonTextColors
    );
    if (rendered?.screenshotBase64) {
      report.previewScreenshot = rendered.screenshotBase64;
    }
    return {
      status: 200,
      headers: JSON_HEADERS,
      body: report
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFetch = /fetch failed|aborted|ENOTFOUND|ECONNREFUSED|certificate|timed out/i.test(message);
    return {
      status: isFetch ? 422 : 500,
      headers: JSON_HEADERS,
      body: {
        error: isFetch ? "Could not fetch the URL" : "Failed to analyze URL",
        details: message
      }
    };
  }
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
        error: "Analyzer no configurado",
        details: "En Vercel define PUBLIC_ANALYZE_API_URL con la URL de tu servicio analyzer (Railway/Render). Ver README."
      }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
  const result = await handleAnalyzeRequest(payload);
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
