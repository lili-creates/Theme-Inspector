import type { DeclaredBrandToken, PaletteColor, ThemeResult } from "../../types/analysis";
import {
  getBrandTokenSemanticHint,
  getTokenRoleHint,
  isDeclaredBrandTokenName,
} from "../brandTokens";
import {
  buildRenderedColorLookup,
  extractColorsFromCss,
  getRenderedColorWeight,
  getRenderedColorWeightExact,
  getRenderedColorFamilyWeight,
  type ColorUsage,
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
import {
  colorVisualScore,
  hasMeaningfulVisualPresence,
  isCssOnlyGhostColor,
  pickPrimaryColor,
  pickSecondaryColor,
  reconcilePrimarySecondary,
  reconcileSecondaryWithHeadingAccent,
  pickSecondaryFromHeadingAccent,
  type VisualBrandContext,
} from "./visualBrandRoles";
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

  if (semanticHexes.has(c.hex.toUpperCase())) {
    // Mismo hex en reglas semánticas y en marca: si domina el CSS de UI, sigue siendo marca.
    if (c.score >= 100 && c.semanticWeight < c.score * 0.32) return false;
    return true;
  }

  if (isFeedbackChromaticColor(c.hsl) && c.semanticWeight > 0) return true;
  if (c.semanticWeight <= 0) return false;
  return c.semanticWeight >= 5 && c.semanticWeight >= c.score * 0.28;
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

function isSecondaryBrandVariableName(name: string): boolean {
  const lower = name.toLowerCase();
  if (isSemanticColorContext(lower)) return false;
  if (/\bprimary\b/.test(lower) && !/(secondary|secundario)/.test(lower)) return false;
  // Real brand tokens — not menu/row/cell UI highlights
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

function normalizedRenderedMap(
  signals: Record<string, number> | undefined,
): { norm: (hex: string) => number; max: number } {
  const rendered = buildRenderedColorLookup(signals);
  return {
    max: rendered.max,
    norm: (hex: string) => {
      if (rendered.max <= 0) return 0;
      return Math.max(0, Math.min(1, getRenderedColorWeight(rendered.lookup, hex) / rendered.max));
    },
  };
}

/** Grises y negros de copy, no acentos cromáticos de marca. */
function isCopyTextNeutral(hsl: { h: number; s: number; l: number }, isDarkTheme: boolean): boolean {
  if (isDarkTheme) return hsl.l >= 62;
  if (hsl.l >= 92) return false;
  if (hsl.s < 28 && hsl.l >= 14 && hsl.l <= 52) return true;
  return hsl.s < 10 && hsl.l >= 8 && hsl.l <= 42;
}

/** Enlaces o labels en color de acento — no es texto de cuerpo. */
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
  renderedBackgroundSignals?: Record<string, number>,
  renderedButtonFillSignals?: Record<string, number>,
  renderedHeadingTextSignals?: Record<string, number>,
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

  const rendered = buildRenderedColorLookup(renderedSignals);
  const renderedBackground = buildRenderedColorLookup(renderedBackgroundSignals);
  const renderedButtonFill = buildRenderedColorLookup(renderedButtonFillSignals);
  const renderedHeadingText = buildRenderedColorLookup(renderedHeadingTextSignals);

  /** Fracción 0–1 del peso visual total en viewport (para % en UI y umbrales). */
  const renderedShare = (hex: string): number => {
    if (!rendered.sampled || rendered.total <= 0) return 0;
    return getRenderedColorWeight(rendered.lookup, hex) / rendered.total;
  };

  /** Superficies de fondo (headers, hero) — mejor proxy del color de marca dominante. */
  const renderedBackgroundShare = (hex: string): number => {
    if (!renderedBackground.sampled || renderedBackground.total <= 0) return 0;
    return getRenderedColorWeight(renderedBackground.lookup, hex) / renderedBackground.total;
  };

  /** Relleno de botones / CTAs visibles (acento de marca en interacción). */
  const renderedButtonFillShare = (hex: string): number => {
    if (!renderedButtonFill.sampled || renderedButtonFill.total <= 0) return 0;
    return getRenderedColorWeight(renderedButtonFill.lookup, hex) / renderedButtonFill.total;
  };

  /** Shares exactos (sin mezclar matiz cercano) para roles primario/secundario. */
  const renderedShareExact = (hex: string): number => {
    if (!rendered.sampled || rendered.total <= 0) return 0;
    return getRenderedColorWeightExact(rendered.lookup, hex) / rendered.total;
  };
  const renderedBackgroundShareExact = (hex: string): number => {
    if (!renderedBackground.sampled || renderedBackground.total <= 0) return 0;
    return getRenderedColorWeightExact(renderedBackground.lookup, hex) / renderedBackground.total;
  };
  const renderedButtonFillShareExact = (hex: string): number => {
    if (!renderedButtonFill.sampled || renderedButtonFill.total <= 0) return 0;
    return getRenderedColorWeightExact(renderedButtonFill.lookup, hex) / renderedButtonFill.total;
  };
  const renderedHeadingTextShareExact = (hex: string): number => {
    if (!renderedHeadingText.sampled || renderedHeadingText.total <= 0) return 0;
    return getRenderedColorWeightExact(renderedHeadingText.lookup, hex) / renderedHeadingText.total;
  };

  const familyShare =
    (lookup: Map<string, number>, total: number) =>
    (hex: string): number => {
      if (total <= 0) return 0;
      return getRenderedColorFamilyWeight(lookup, hex) / total;
    };

  const renderedHeadingTextShareFamily = renderedHeadingText.sampled
    ? familyShare(renderedHeadingText.lookup, renderedHeadingText.total)
    : undefined;
  const renderedButtonFillShareFamily = renderedButtonFill.sampled
    ? familyShare(renderedButtonFill.lookup, renderedButtonFill.total)
    : undefined;
  const renderedBackgroundShareFamily = renderedBackground.sampled
    ? familyShare(renderedBackground.lookup, renderedBackground.total)
    : undefined;

  const { tokens: brandTokens, tokenSemanticHintByHex, tokenRoleHintByHex } =
    buildDeclaredBrandTokens(variablesMap, cssString, resolveColor, renderedShareExact);

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
    const rn = renderedShare(hex);
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
    const rbf = renderedButtonFillShare(entry.hex);
    if (rbf > 0) {
      entry.score += rbf * 240;
      entry.score *= 1 + rbf * 0.35;
    }
    const rh = Math.max(
      renderedHeadingTextShareExact(entry.hex),
      renderedHeadingTextShareFamily?.(entry.hex) ?? 0,
    );
    if (rh > 0) {
      entry.score += rh * 280;
      entry.headingTextScore += rh * 120;
    }

    // Prefer colors that are actually visible in rendered viewport.
    const rn = renderedShareExact(entry.hex);
    if (rn > 0) {
      // Strong additive and multiplicative boost for visible colors.
      entry.score += rn * 220;
      entry.score *= 1 + rn * 0.55;
    } else if (rendered.sampled && entry.hsl.s >= 30) {
      // If we have rendered evidence and this chromatic color is not visible,
      // reduce its influence so "CSS-only" tokens do not dominate brand roles.
      entry.score *= 0.62;
    }

    // Extra bump for colors in the upper quartile of rendered prevalence.
    if (
      rendered.sampled &&
      rendered.p75 > 0 &&
      getRenderedColorWeight(rendered.lookup, entry.hex) >= rendered.p75
    ) {
      entry.score += 80;
    }
  }

  const ranked = [...extracted.values()].sort((a, b) => b.score - a.score || b.count - a.count);

  const chromatic = ranked.filter((c) => {
    if (isNeutralColor(c.hsl)) return false;
    if (isStockCssKeywordColor(c.hex)) return false;
    return !shouldExcludeFromBrandRoles(
      c,
      semanticHexes,
      renderedShareExact,
      tokenSemanticHintByHex,
    );
  });
  const neutrals = ranked.filter((c) => isNeutralColor(c.hsl));

  const brandPool = chromatic.filter((c) => c.hsl.s >= 30);
  const candidates = [...(brandPool.length > 0 ? brandPool : chromatic)];

  const visualCtx: VisualBrandContext = {
    renderedShare: renderedShareExact,
    renderedBackgroundShare: renderedBackgroundShareExact,
    renderedButtonFillShare: renderedButtonFillShareExact,
    renderedHeadingTextShare: renderedHeadingTextShareExact,
    renderedHeadingTextShareFamily: renderedHeadingTextShareFamily,
    renderedButtonFillShareFamily: renderedButtonFillShareFamily,
    renderedBackgroundShareFamily: renderedBackgroundShareFamily,
    tokenRoleHintByHex,
    renderedSampled: rendered.sampled,
    renderedBackgroundSampled: renderedBackground.sampled,
    renderedButtonFillSampled: renderedButtonFill.sampled,
    renderedHeadingTextSampled: renderedHeadingText.sampled,
  };

  const brandSelectionScore = (c: (typeof chromatic)[number]): number =>
    colorVisualScore(c, visualCtx);

  const chromaticRanked = [...candidates].sort(
    (a, b) => brandSelectionScore(b) - brandSelectionScore(a) || b.score - a.score,
  );

  let primary = pickPrimaryColor(candidates, visualCtx);

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

  let secondary = pickSecondaryColor(
    secondaryCandidates,
    primary,
    visualCtx,
    secondaryHintHexes,
  );

  if (!secondary && primary) {
    secondary = pickSecondaryFromHeadingAccent(secondaryCandidates, primary, visualCtx);
  }
  secondary = reconcileSecondaryWithHeadingAccent(
    secondary,
    secondaryCandidates,
    primary,
    visualCtx,
  );

  ({ primary, secondary } = reconcilePrimarySecondary(primary, secondary, visualCtx));

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

  // Acentos: solo colores vistos en pantalla (no fantasmas del CSS)
  let accentCount = 0;
  for (const c of chromaticRanked) {
    if (accentCount >= 2) break;
    if (roles.has(c.hex)) continue;
    if (c.hsl.s < 35) continue;
    if (!hasMeaningfulVisualPresence(visualCtx, c)) continue;
    const noViewport =
      !visualCtx.renderedSampled &&
      !visualCtx.renderedBackgroundSampled &&
      !visualCtx.renderedButtonFillSampled;
    if (
      isFeedbackChromaticColor(c.hsl) &&
      (noViewport ? c.count < 25 : visualCtx.renderedShare(c.hex) < 0.015)
    ) {
      continue;
    }
    if (noViewport && isCssOnlyGhostColor(c, visualCtx)) {
      continue;
    }
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
    const share = renderedShareExact(c.hex);
    return {
      hex: c.hex,
      usage: c.count,
      score: Math.round(c.score * 10) / 10,
      role: roles.get(c.hex) ?? "palette",
      hsl: c.hsl,
      source,
      visibleWeight: rendered.sampled ? Math.round(share * 100) : 0,
    };
  };

  const chromaticForBrand = ranked.filter(
    (c) =>
      !isNeutralColor(c.hsl) &&
      c.hsl.s >= 25 &&
      !isStockCssKeywordColor(c.hex) &&
      !shouldExcludeFromBrandRoles(
        c,
        semanticHexes,
        renderedShareExact,
        tokenSemanticHintByHex,
      ),
  );

  const brandVisible = (() => {
    const roleColors = chromaticForBrand.filter((c) => roles.has(c.hex));
    if (!rendered.sampled) {
      return roleColors
        .map((c) => toPaletteColor(c, "visible"))
        .sort((a, b) => {
          const ra = roleOrder[a.role ?? "palette"] ?? 5;
          const rb = roleOrder[b.role ?? "palette"] ?? 5;
          if (ra !== rb) return ra - rb;
          return b.score - a.score;
        });
    }

    const fromViewport = chromaticForBrand.filter(
      (c) =>
        roles.has(c.hex) ||
        (hasMeaningfulVisualPresence(visualCtx, c) && !isCssOnlyGhostColor(c, visualCtx)),
    );
    return fromViewport
      .map((c) => toPaletteColor(c, "visible"))
      .sort((a, b) => {
        const ra = roleOrder[a.role ?? "palette"] ?? 5;
        const rb = roleOrder[b.role ?? "palette"] ?? 5;
        if (ra !== rb) return ra - rb;
        return b.visibleWeight - a.visibleWeight || b.score - a.score;
      });
  })();

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
    viewportSampled: rendered.sampled,
    brandTokens,
    brandVisible,
    brandLegacy,
    palette: paletteSorted,
  };
}
