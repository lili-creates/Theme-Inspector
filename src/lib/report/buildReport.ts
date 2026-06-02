import type { AnalysisReport, CssVariable, ThemeResult } from "../../types/analysis";
import { parseColorToHsl } from "../color/colorMath";
import { categorizeVariable } from "../css/categorizeVariable";
import { computeCssStats } from "../css/stats";
import { countVariableUsage } from "../css/parseVariables";
import { analyzeThemeFromCss } from "../theme/analyzeTheme";
export function buildVariableCatalog(
  css: string,
  variablesMap: Map<string, string>,
): CssVariable[] {
  const list: CssVariable[] = [];

  for (const [name, value] of variablesMap.entries()) {
    const hsl = parseColorToHsl(value);
    const isColor = hsl !== null || categorizeVariable(name, value) === "color";
    list.push({
      name,
      value,
      category: isColor ? "color" : categorizeVariable(name, value),
      usage: countVariableUsage(css, name),
      isColor,
      hsl,
    });
  }

  return list.sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));
}

export function groupByCategory(
  variables: CssVariable[],
  excludeChromaticHex?: Set<string>,
): AnalysisReport["variablesByCategory"] {
  const empty: AnalysisReport["variablesByCategory"] = {
    color: [],
    spacing: [],
    typography: [],
    radius: [],
    shadow: [],
    animation: [],
    layout: [],
    other: [],
  };

  for (const v of variables) {
    if (
      v.category === "color" &&
      v.isColor &&
      excludeChromaticHex?.has(v.value.toUpperCase()) &&
      v.hsl &&
      v.hsl.s >= 25
    ) {
      continue;
    }
    empty[v.category].push(v);
  }

  return empty;
}

function mergeDetectedColorsIntoCatalog(
  variables: CssVariable[],
  theme: ThemeResult,
): CssVariable[] {
  const seen = new Set(variables.filter((v) => v.isColor).map((v) => v.value.toUpperCase()));
  const extras: CssVariable[] = [];
  const paletteForCatalog = [...theme.brandVisible, ...theme.brandLegacy, ...theme.palette];

  for (const p of paletteForCatalog) {
    const hex = p.hex.toUpperCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    const label =
      p.role && p.role !== "palette"
        ? `--detected-${p.role}`
        : `--color-${hex.replace("#", "").toLowerCase()}`;
    extras.push({
      name: label,
      value: p.hex,
      category: "color",
      usage: p.usage,
      isColor: true,
      hsl: p.hsl,
    });
  }

  const pushIdentityToken = (hex: string | null, role: string) => {
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
      hsl: parseColorToHsl(hex),
    });
  };

  pushIdentityToken(theme.text_on_background, "text-surface");
  if (theme.text_on_button && theme.text_on_button !== theme.text_on_background) {
    pushIdentityToken(theme.text_on_button, "text-button");
  }

  return [...variables, ...extras].sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));
}

export function buildAnalysisReport(
  url: string,
  css: string,
  stylesheetCount: number,
  variablesMap: Map<string, string>,
  html?: string,
  renderedSignals?: Record<string, number>,
  renderedTextSignals?: Record<string, number>,
  renderedButtonTextSignals?: Record<string, number>,
  renderedBackgroundSignals?: Record<string, number>,
  renderedButtonFillSignals?: Record<string, number>,
  renderedHeadingTextSignals?: Record<string, number>,
): AnalysisReport {
  const theme = analyzeThemeFromCss(
    css,
    variablesMap,
    html,
    renderedSignals,
    renderedTextSignals,
    renderedButtonTextSignals,
    renderedBackgroundSignals,
    renderedButtonFillSignals,
    renderedHeadingTextSignals,
  );
  const variables = mergeDetectedColorsIntoCatalog(buildVariableCatalog(css, variablesMap), theme);
  const brandChromatics = new Set(
    [...theme.brandVisible, ...theme.brandLegacy].map((c) => c.hex.toUpperCase()),
  );
  return {
    url,
    analyzedAt: new Date().toISOString(),
    stats: computeCssStats(css, stylesheetCount),
    theme,
    variables,
    variablesByCategory: groupByCategory(variables, brandChromatics),
  };
}
