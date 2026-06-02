import type { DeclaredBrandToken, PaletteColor, ThemeResult } from "../../types/analysis";
import {
  getBrandTokenSemanticHint,
  getTokenRoleHint,
  isDeclaredBrandTokenName,
} from "../brandTokens";
import {
  extractColorsFromCss,
  type ColorUsage,
  hueDistance,
  isNeutralColor,
  isStockCssKeywordColor,
  normalizeColorToHex,
  resolveCssColor,
} from "../colorExtract";
import { parseColorToHsl } from "../color/colorMath";
import { countVariableUsage } from "../css/parseVariables";
import {
  collectSemanticHexesFromCssRules,
  collectSemanticHexesFromVariables,
  isFeedbackChromaticColor,
  isSemanticColorContext,
} from "../semanticColors";
function mergeSemanticHexSets(...sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const h of s) out.add(h);
  return out;
}

const VISIBLE_BRAND_ROLE_THRESHOLD = 0.05;

function shouldExcludeFromBrandRoles(
  c: ColorUsage,
  semanticHexes: Set<string>,
  renderedNorm: (hex: string) => number,
  tokenSemanticHintByHex: Map<string, DeclaredBrandToken["semanticHint"]>,
): boolean {
  const vn = renderedNorm(c.hex);
  if (vn >= VISIBLE_BRAND_ROLE_THRESHOLD) return false;

  const tokenHint = tokenSemanticHintByHex.get(c.hex.toUpperCase());
  if (tokenHint) return true;

  if (semanticHexes.has(c.hex.toUpperCase())) return true;

  if (isFeedbackChromaticColor(c.hsl) && c.semanticWeight > 0) return true;
  if (c.semanticWeight <= 0) return false;
  return c.semanticWeight >= 5 && c.semanticWeight >= c.score * 0.28;
}

function colorUsageFromHintHex(
  hex: string,
  extracted: Map<string, ColorUsage>,
): ColorUsage | null {
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
    buttonTextScore: 0,
  };
}

function buildDeclaredBrandTokens(
  variablesMap: Map<string, string>,
  css: string,
  resolve: (value: string) => string,
  renderedNorm: (hex: string) => number,
): {
  tokens: DeclaredBrandToken[];
  tokenSemanticHintByHex: Map<string, DeclaredBrandToken["semanticHint"]>;
  tokenRoleHintByHex: Map<string, DeclaredBrandToken["roleHint"]>;
} {
  const tokens: DeclaredBrandToken[] = [];
  const tokenSemanticHintByHex = new Map<string, DeclaredBrandToken["semanticHint"]>();
  const tokenRoleHintByHex = new Map<string, DeclaredBrandToken["roleHint"]>();

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
      usedOnScreen: visibleWeight > 3,
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

/** Prefer a second brand hue in the same family (e.g. two blues on KLM). */
function isAnalogousHue(
  primaryH: number,
  candidateH: number,
  maxDistance = 55,
): boolean {
  const d = hueDistance(primaryH, candidateH);
  return d >= 6 && d <= maxDistance;
}

function isInstitutionalCoolPrimary(hsl: { h: number; s: number; l: number }): boolean {
  return hsl.h >= 185 && hsl.h <= 255 && hsl.l <= 48 && hsl.s >= 35;
}

/** Gold / amber / yellow accents (ICP, Vueling), not yellow-greens. */
function isGoldYellowAccent(hsl: { h: number; s: number; l: number }): boolean {
  return hsl.h >= 32 && hsl.h <= 68 && hsl.s >= 45 && hsl.l >= 30 && hsl.l <= 72;
}

function isSecondaryBrandVariableName(name: string): boolean {
  const lower = name.toLowerCase();
  if (isSemanticColorContext(lower)) return false;
  if (/\bprimary\b/.test(lower) && !/(secondary|secundario)/.test(lower)) return false;
  // Real brand tokens â€” not menu/row/cell UI highlights
  if (/(menu_|megamenu|row_|cell_|hover|focus|selection|highlighted)/.test(lower)) {
    return false;
  }
  if (/(?:^|[-_])(secondary|secundario|complement)(?:[-_]|$)/.test(lower)) return true;
  if (/(?:^|[-_])brand[-_]?(secondary|accent|highlight)(?:[-_]|$)/.test(lower)) {
    return true;
  }
  return false;
}

function isTextBrandVariableName(name: string): boolean {
  const lower = name.toLowerCase();
  if (isSemanticColorContext(lower)) return false;
  if (/(background|border|shadow|outline|icon|logo|menu|highlight)/.test(lower)) return false;
  if (/(?:^|[-_])(text|foreground|copy|body-text|font-color|color-text)(?:[-_]|$)/.test(lower)) {
    return true;
  }
  return false;
}

function collectTextHintHexes(
  variablesMap: Map<string, string>,
  resolve: (value: string) => string,
): Set<string> {
  const out = new Set<string>();
  for (const [name, value] of variablesMap.entries()) {
    if (!isTextBrandVariableName(name)) continue;
    const hex = normalizeColorToHex(resolve(value));
    if (hex) out.add(hex.toUpperCase());
  }
  return out;
}

function isButtonTextVariableName(name: string): boolean {
  const lower = name.toLowerCase();
  if (isSemanticColorContext(lower)) return false;
  if (
    /(?:^|[-_])(button-text|btn-text|cta-text|button-color|btn-color|on-primary|on-secondary|primary-foreground|secondary-foreground)(?:[-_]|$)/.test(
      lower,
    )
  ) {
    return true;
  }
  if (/(foreground-on-|text-on-|color-on-)(primary|secondary|button|cta|brand)/.test(lower)) {
    return true;
  }
  return false;
}

function collectButtonTextHintHexes(
  variablesMap: Map<string, string>,
  resolve: (value: string) => string,
): Set<string> {
  const out = new Set<string>();
  for (const [name, value] of variablesMap.entries()) {
    if (!isButtonTextVariableName(name)) continue;
    const hex = normalizeColorToHex(resolve(value));
    if (hex) out.add(hex.toUpperCase());
  }
  return out;
}

function collectSecondaryHintHexes(
  variablesMap: Map<string, string>,
  resolve: (value: string) => string,
): Set<string> {
  const out = new Set<string>();
  for (const [name, value] of variablesMap.entries()) {
    if (!isSecondaryBrandVariableName(name)) continue;
    const hex = normalizeColorToHex(resolve(value));
    if (hex) out.add(hex.toUpperCase());
  }
  return out;
}

function brandColorBoost(hsl: { h: number; s: number; l: number }): number {
  let boost = 0;
  // Amarillo/dorado de marca (p. ej. Vueling #F7C600)
  if (hsl.h >= 38 && hsl.h <= 68 && hsl.s >= 70 && hsl.l >= 32 && hsl.l <= 62) {
    boost += 35;
  }
  // Colores de marca saturados (no neutros)
  if (hsl.s >= 55 && hsl.l >= 22 && hsl.l <= 78) {
    boost += 8;
  }
  return boost;
}

function normalizedRenderedMap(
  signals: Record<string, number> | undefined,
): { norm: (hex: string) => number; max: number } {
  const values = Object.values(signals ?? {});
  const max = values.length > 0 ? Math.max(...values) : 0;
  return {
    max,
    norm: (hex: string) => {
      if (max <= 0) return 0;
      return Math.max(0, Math.min(1, (signals?.[hex] ?? 0) / max));
    },
  };
}

/** Grises y negros de copy (p. ej. menÃºs TAP), no verde lima de marca. */
function isCopyTextNeutral(hsl: { h: number; s: number; l: number }, isDarkTheme: boolean): boolean {
  if (isDarkTheme) return hsl.l >= 62;
  if (hsl.l >= 92) return false;
  if (hsl.s < 28 && hsl.l >= 14 && hsl.l <= 52) return true;
  return hsl.s < 10 && hsl.l >= 8 && hsl.l <= 42;
}

/** Enlaces o labels de marca en color (verde lima TAP, etc.) â€” no es texto de cuerpo. */
function isVividAccentTextColor(hsl: { h: number; s: number; l: number }): boolean {
  if (hsl.l < 26 || hsl.l > 80) return false;
  return hsl.s >= 38;
}

function pickDominantRenderedTextColor(
  renderedTextSignals: Record<string, number> | undefined,
  extracted: Map<string, ColorUsage>,
  isDarkTheme: boolean,
  semanticHexes: Set<string>,
  renderedText: { norm: (hex: string) => number },
  primary: ColorUsage | null,
): ColorUsage | null {
  if (!renderedTextSignals) return null;

  type RenderedTextEntry = { hex: string; weight: number; usage: ColorUsage };

  const renderedScore = (entry: RenderedTextEntry) => {
    const c = entry.usage;
    let s = entry.weight;
    if (isCopyTextNeutral(c.hsl, isDarkTheme)) s *= 2.8;
    if (isVividAccentTextColor(c.hsl)) s *= 0.12;
    if (primary && entry.hex === primary.hex) s *= 0.08;
    return s;
  };

  const ranked = Object.entries(renderedTextSignals)
    .map(([hex, weight]) => {
      const usage = extracted.get(hex);
      if (!usage || weight <= 0) return null;
      return { hex, weight, usage };
    })
    .filter((e): e is RenderedTextEntry => e !== null)
    .sort((a, b) => renderedScore(b) - renderedScore(a));

  for (const entry of ranked) {
    const c = entry.usage!;
    if (isStockCssKeywordColor(c.hex)) continue;
    if (semanticHexes.has(c.hex.toUpperCase()) && renderedText.norm(c.hex) < 0.06) continue;
    if (!isDarkTheme && isVividAccentTextColor(c.hsl)) continue;
    if (primary && c.hex === primary.hex) continue;
    if (!isCopyTextNeutral(c.hsl, isDarkTheme) && !isDarkTheme) continue;
    return c;
  }
  return null;
}

function selectTextOnSurface(
  extracted: Map<string, ColorUsage>,
  options: {
    isDarkTheme: boolean;
    primary: ColorUsage | null;
    textHintHexes: Set<string>;
    semanticHexes: Set<string>;
    renderedText: { norm: (hex: string) => number };
  },
): ColorUsage | null {
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

  const textSelectionScore = (c: ColorUsage): number => {
    const rt = renderedText.norm(c.hex);
    const hint = textHintHexes.has(c.hex.toUpperCase()) ? 140 : 0;
    const neutralBodyBonus = !isDarkTheme && isCopyTextNeutral(c.hsl, isDarkTheme) ? 90 + rt * 200 : 0;
    const vividAccentPenalty = !isDarkTheme && isVividAccentTextColor(c.hsl) ? -400 : 0;
    const primaryPenalty = primary && c.hex === primary.hex ? -500 : 0;
    const whitePenalty = !isDarkTheme && c.hsl.l >= 92 ? -250 : 0;
    const blackPenalty = !isDarkTheme && c.hsl.s < 8 && c.hsl.l <= 6 ? -40 : 0;
    return (
      c.textScore * 6 +
      rt * 520 +
      hint +
      neutralBodyBonus +
      vividAccentPenalty +
      primaryPenalty +
      whitePenalty +
      blackPenalty
    );
  };

  const ranked = [...lightTextPool].sort(
    (a, b) => textSelectionScore(b) - textSelectionScore(a) || b.textScore - a.textScore,
  );
  return ranked[0] ?? null;
}

function selectTextOnButton(
  extracted: Map<string, ColorUsage>,
  options: {
    buttonFill: ColorUsage | null;
    textOnSurface: ColorUsage | null;
    buttonTextHintHexes: Set<string>;
    semanticHexes: Set<string>;
    renderedButtonText: { norm: (hex: string) => number };
    neutrals: ColorUsage[];
  },
): ColorUsage | null {
  const {
    buttonFill,
    textOnSurface,
    buttonTextHintHexes,
    semanticHexes,
    renderedButtonText,
    neutrals,
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
    buttonFill &&
      buttonFill.hsl.h >= 35 &&
      buttonFill.hsl.h <= 75 &&
      buttonFill.hsl.l >= 38 &&
      buttonFill.hsl.l <= 72,
  );

  const contrastPool = pool.filter((c) => {
    if (fillIsVividWarm) return c.hsl.l >= 8 && c.hsl.l <= 40;
    if (fillIsDark) return c.hsl.l >= 62;
    if (fillIsLight) return c.hsl.l <= 42;
    return true;
  });

  const buttonTextSelectionScore = (c: ColorUsage): number => {
    const rb = renderedButtonText.norm(c.hex);
    const hint = buttonTextHintHexes.has(c.hex.toUpperCase()) ? 130 : 0;
    const contrastBonus = fillIsDark && c.hsl.l >= 78 ? 45 : fillIsLight && c.hsl.l <= 30 ? 45 : 0;
    const surfacePenalty = textOnSurface && c.hex === textOnSurface.hex ? -90 : 18;
    return c.buttonTextScore * 7 + rb * 520 + hint + contrastBonus + surfacePenalty;
  };

  const ranked = [...(contrastPool.length > 0 ? contrastPool : pool)].sort(
    (a, b) => buttonTextSelectionScore(b) - buttonTextSelectionScore(a) || b.buttonTextScore - a.buttonTextScore,
  );

  let pick = ranked[0] ?? null;
  if (pick && textOnSurface && pick.hex === textOnSurface.hex) {
    pick = ranked.find((c) => c.hex !== textOnSurface.hex) ?? pick;
  }
  if (pick) return pick;

  if (fillIsDark) {
    return (
      neutrals.find((c) => c.hsl.l >= 88) ??
      [...extracted.values()].find((c) => c.hex === "#FFFFFF") ??
      null
    );
  }
  if (fillIsLight || fillIsVividWarm) {
    return (
      [...extracted.values()].find(
        (c) => c.hsl.l <= 35 && c.hsl.l >= 8 && !isStockCssKeywordColor(c.hex),
      ) ??
      neutrals.find((c) => c.hsl.l <= 28 && !isStockCssKeywordColor(c.hex)) ??
      null
    );
  }
  return null;
}

export function analyzeThemeFromCss(
  cssString: string,
  variablesMap: Map<string, string>,
  html?: string,
  renderedSignals?: Record<string, number>,
  renderedTextSignals?: Record<string, number>,
  renderedButtonTextSignals?: Record<string, number>,
): ThemeResult {
  const extracted = extractColorsFromCss(cssString, variablesMap, html, renderedSignals);

  const resolveColor = (value: string) => resolveCssColor(value, variablesMap);
  const semanticHexes = mergeSemanticHexSets(
    collectSemanticHexesFromVariables(variablesMap, resolveColor, normalizeColorToHex),
    collectSemanticHexesFromCssRules(cssString, variablesMap, resolveColor, normalizeColorToHex),
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

  const renderedNormalized = (hex: string): number => {
    if (!renderedSignals || renderedScale.max <= 0) return 0;
    const v = renderedSignals[hex] ?? 0;
    return Math.max(0, Math.min(1, v / renderedScale.max));
  };

  const { tokens: brandTokens, tokenSemanticHintByHex, tokenRoleHintByHex } =
    buildDeclaredBrandTokens(variablesMap, cssString, resolveColor, renderedNormalized);

  // Boost variables whose names imply brand roles (suave; la pantalla manda en los roles)
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

    // Prefer colors that are actually visible in rendered viewport.
    const rn = renderedNormalized(entry.hex);
    if (rn > 0) {
      // Strong additive and multiplicative boost for visible colors.
      entry.score += rn * 220;
      entry.score *= 1 + rn * 0.55;
    } else if (renderedSignals && entry.hsl.s >= 30) {
      // If we have rendered evidence and this chromatic color is not visible,
      // reduce its influence so "CSS-only" tokens do not dominate brand roles.
      entry.score *= 0.62;
    }

    // Extra bump for colors in the upper quartile of rendered prevalence.
    if (
      renderedSignals &&
      renderedScale.p75 > 0 &&
      (renderedSignals[entry.hex] ?? 0) >= renderedScale.p75
    ) {
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
      tokenSemanticHintByHex,
    );
  });
  const neutrals = ranked.filter((c) => isNeutralColor(c.hsl));

  const brandSelectionScore = (c: (typeof chromatic)[number]): number => {
    const rn = renderedNormalized(c.hex);
    const saturationBonus = Math.max(0, c.hsl.s - 35) * 0.45;
    const vividRangeBonus = c.hsl.l >= 24 && c.hsl.l <= 72 ? 10 : 0;
    const yellowBrandBonus =
      rn > 0.04 && c.hsl.h >= 38 && c.hsl.h <= 68 && c.hsl.s >= 60 && c.hsl.l >= 28 && c.hsl.l <= 70
        ? 10
        : 0;
    // Base structural score (DOM/CSS prevalence) should dominate when render signal is missing.
    return c.score * 0.85 + rn * 420 + saturationBonus + vividRangeBonus + yellowBrandBonus;
  };

  const brandPool = chromatic.filter((c) => c.hsl.s >= 30);
  const candidates = [...(brandPool.length > 0 ? brandPool : chromatic)];

  const hasVisibleInstitutionalNavy = candidates.some(
    (c) =>
      c.hsl.h >= 200 &&
      c.hsl.h <= 255 &&
      c.hsl.l <= 42 &&
      renderedNormalized(c.hex) >= 0.02,
  );

  const primarySelectionScore = (c: (typeof chromatic)[number]): number => {
    const rn = renderedNormalized(c.hex);
    const saturationBonus = Math.max(0, c.hsl.s - 30) * 0.22;
    const readabilityBonus = c.hsl.l >= 16 && c.hsl.l <= 58 ? 8 : 0;
    const tokenHint =
      tokenRoleHintByHex.get(c.hex.toUpperCase()) === "primary" ? 18 + rn * 45 : 0;
    const navyBrandBoost =
      hasVisibleInstitutionalNavy &&
      c.hsl.h >= 200 &&
      c.hsl.h <= 255 &&
      c.hsl.l <= 42
        ? 130 + rn * 60
        : 0;
    const yellowNotPrimaryPenalty =
      hasVisibleInstitutionalNavy && c.hsl.h >= 32 && c.hsl.h <= 72 ? -90 : 0;
    return (
      c.score * 0.75 +
      rn * 480 +
      saturationBonus +
      readabilityBonus +
      tokenHint +
      navyBrandBoost +
      yellowNotPrimaryPenalty
    );
  };

  const chromaticRanked = [...candidates].sort(
    (a, b) => brandSelectionScore(b) - brandSelectionScore(a) || b.score - a.score,
  );

  const primaryByScore = [...candidates].sort(
    (a, b) => primarySelectionScore(b) - primarySelectionScore(a) || b.score - a.score,
  )[0];

  const tokenPrimaryEntry = brandTokens.find(
    (t) =>
      !t.semanticHint &&
      (t.roleHint === "primary" ||
        /(lhdeepblue|deepblue|brand-blue|navy)/i.test(t.name)),
  );
  const tokenPrimary = tokenPrimaryEntry
    ? colorUsageFromHintHex(tokenPrimaryEntry.hex, extracted)
    : null;

  const primary = (() => {
    if (!primaryByScore && !tokenPrimary) return null;
    if (!tokenPrimary) return primaryByScore ?? null;
    if (!primaryByScore) return tokenPrimary;

    const vnScore = renderedNormalized(primaryByScore.hex);
    const vnToken = renderedNormalized(tokenPrimary.hex);

    if (renderedScale.max <= 0) return tokenPrimary;

    if (
      isInstitutionalCoolPrimary(tokenPrimary.hsl) &&
      isGoldYellowAccent(primaryByScore.hsl) &&
      vnScore < 0.22
    ) {
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
    const isRedFeedback =
      (c.hsl.h <= 30 || c.hsl.h >= 345) && isFeedbackChromaticColor(c.hsl);
    if (isRedFeedback) return false;
    return true;
  });

  const pickBest = (list: ColorUsage[]): ColorUsage | null =>
    list.length > 0
      ? [...list].sort(
          (a, b) => brandSelectionScore(b) - brandSelectionScore(a) || b.score - a.score,
        )[0]!
      : null;

  const secondarySelectionScore = (c: (typeof chromatic)[number]): number => {
    const rn = renderedNormalized(c.hex);
    const tokenHint =
      tokenRoleHintByHex.get(c.hex.toUpperCase()) === "secondary" ? 16 + rn * 40 : 0;
    return brandSelectionScore(c) + tokenHint;
  };

  const fromHint =
    [...secondaryCandidates]
      .sort((a, b) => secondarySelectionScore(b) - secondarySelectionScore(a))
      .find(
        (c) =>
          tokenRoleHintByHex.get(c.hex.toUpperCase()) === "secondary" ||
          secondaryHintHexes.has(c.hex.toUpperCase()),
      ) ?? null;

  const goldYellowCandidates = secondaryCandidates.filter((c) => isGoldYellowAccent(c.hsl));
  const analogousCandidates = secondaryCandidates.filter(
    (c) => primary && isAnalogousHue(primary.hsl.h, c.hsl.h),
  );

  const secondaryFromCoolPrimary = (): ColorUsage | null => {
    if (!primary || !isInstitutionalCoolPrimary(primary.hsl)) return null;
    const bestGold = pickBest(goldYellowCandidates);
    const bestAnalogous = pickBest(analogousCandidates);
    if (bestGold && !bestAnalogous) return bestGold;
    if (bestGold && bestAnalogous) {
      // ICP-style: gold/yellow accent; KLM keeps blue when gold is weak.
      if (bestGold.count >= 4 || bestGold.score >= bestAnalogous.score * 0.35) {
        return bestGold;
      }
      return bestAnalogous;
    }
    return bestAnalogous;
  };

  const contrastingCandidates = secondaryCandidates.filter(
    (c) => primary && hueDistance(c.hsl.h, primary.hsl.h) >= 25,
  );

  const secondary =
    fromHint ??
    secondaryFromCoolPrimary() ??
    pickBest(analogousCandidates) ??
    pickBest(goldYellowCandidates) ??
    pickBest(contrastingCandidates) ??
    pickBest(secondaryCandidates) ??
    null;

  const lightBg = neutrals
    .filter((c) => c.hsl.l >= 70)
    .sort((a, b) => b.count - a.count || b.hsl.l - a.hsl.l)[0];
  const darkBg = neutrals
    .filter((c) => c.hsl.l <= 28)
    .sort((a, b) => b.count - a.count || a.hsl.l - b.hsl.l)[0];

  const backgrounds: string[] = [];
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
      darkBg &&
        darkBg.hsl.l <= 12 &&
        lightBg &&
        lightBg.hsl.l < 55 &&
        darkBg.count > lightBg.count * 2.8,
    );
  })();

  const forceLightSurface = Boolean(lightBg && lightBg.hsl.l >= 78);

  const surfaceIsDark = forceLightSurface ? false : isDarkTheme;
  const cssTextPick = selectTextOnSurface(extracted, {
    isDarkTheme: surfaceIsDark,
    primary,
    textHintHexes,
    semanticHexes,
    renderedText,
  });
  const renderedTextPick = pickDominantRenderedTextColor(
    renderedTextSignals,
    extracted,
    surfaceIsDark,
    semanticHexes,
    renderedText,
    primary,
  );

  let textOnSurface = cssTextPick ?? null;
  if (renderedTextPick) {
    const rtRendered = renderedText.norm(renderedTextPick.hex);
    const rtCss = cssTextPick ? renderedText.norm(cssTextPick.hex) : 0;
    const cssIsNeutral = cssTextPick ? isCopyTextNeutral(cssTextPick.hsl, surfaceIsDark) : false;
    const renderedIsAccent = isVividAccentTextColor(renderedTextPick.hsl);
    const preferRendered =
      !cssTextPick ||
      (rtRendered >= rtCss * 1.12 &&
        !renderedIsAccent &&
        (cssIsNeutral || isCopyTextNeutral(renderedTextPick.hsl, surfaceIsDark)));
    if (preferRendered) textOnSurface = renderedTextPick;
  }

  if (!textOnSurface) {
    const neutralFallback = [...extracted.values()]
      .filter((c) => isCopyTextNeutral(c.hsl, surfaceIsDark) && !isStockCssKeywordColor(c.hex))
      .sort(
        (a, b) =>
          renderedText.norm(b.hex) - renderedText.norm(a.hex) ||
          b.textScore - a.textScore ||
          b.count - a.count,
      )[0];
    textOnSurface =
      neutralFallback ??
      (surfaceIsDark
        ? neutrals.filter((c) => c.hsl.l >= 65).sort((a, b) => b.count - a.count)[0]
        : neutrals.filter((c) => c.hsl.l <= 42 && c.hsl.l >= 14).sort((a, b) => b.count - a.count)[0]) ??
      null;
  }

  const textOnButton =
    selectTextOnButton(extracted, {
      buttonFill: primary,
      textOnSurface,
      buttonTextHintHexes,
      semanticHexes,
      renderedButtonText,
      neutrals,
    }) ?? null;

  const roles = new Map<string, PaletteColor["role"]>();
  if (primary) roles.set(primary.hex, "primary");
  if (secondary) roles.set(secondary.hex, "secondary");
  if (lightBg) roles.set(lightBg.hex, "background");
  if (darkBg && darkBg.hex !== lightBg?.hex) roles.set(darkBg.hex, "background");
  if (textOnSurface) roles.set(textOnSurface.hex, "text-surface");
  if (textOnButton && textOnButton.hex !== textOnSurface?.hex) {
    roles.set(textOnButton.hex, "text-button");
  }

  // Top accent colors (saturated, high usage) not already assigned
  let accentCount = 0;
  for (const c of chromatic) {
    if (accentCount >= 2) break;
    if (roles.has(c.hex)) continue;
    if (c.hsl.s < 35) continue;
    roles.set(c.hex, "accent");
    accentCount++;
  }

  const roleOrder: Record<string, number> = {
    primary: 0,
    secondary: 1,
    accent: 2,
    background: 3,
    text: 4,
    "text-surface": 4,
    "text-button": 4,
    palette: 5,
  };

  const toPaletteColor = (
    c: (typeof ranked)[number],
    source: PaletteColor["source"],
  ): PaletteColor => {
    const rn = renderedNormalized(c.hex);
    return {
      hex: c.hex,
      usage: c.count,
      score: Math.round(c.score * 10) / 10,
      role: roles.get(c.hex) ?? "palette",
      hsl: c.hsl,
      source,
      visibleWeight: Math.round(rn * 100),
    };
  };

  const chromaticForBrand = ranked.filter(
    (c) =>
      !isNeutralColor(c.hsl) &&
      c.hsl.s >= 25 &&
      !shouldExcludeFromBrandRoles(
        c,
        semanticHexes,
        renderedNormalized,
        tokenSemanticHintByHex,
      ),
  );

  const brandVisible = chromaticForBrand
    .filter((c) => renderedNormalized(c.hex) > 0.03 || roles.has(c.hex))
    .map((c) => toPaletteColor(c, "visible"))
    .sort((a, b) => {
      const ra = roleOrder[a.role ?? "palette"] ?? 5;
      const rb = roleOrder[b.role ?? "palette"] ?? 5;
      if (ra !== rb) return ra - rb;
      return b.visibleWeight - a.visibleWeight || b.score - a.score;
    });

  const visibleHex = new Set(brandVisible.map((c) => c.hex));
  const brandLegacy = chromaticForBrand
    .filter((c) => !visibleHex.has(c.hex))
    .slice(0, 24)
    .map((c) => toPaletteColor(c, "legacy"))
    .sort((a, b) => b.usage - a.usage || b.score - a.score);

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
    palette: paletteSorted,
  };
}
