/**
 * Public API barrel for CSS/theme analysis.
 * Implementation lives in focused modules under color/, css/, theme/, and report/.
 */
export { parseHexColor, parseRgbColor, rgbToHsl, parseColorToHsl } from "./color/colorMath";
export { normalizeTargetUrl, ensureUrlProtocol } from "./url";
export { extractAllCustomProperties, normalizeCssValue, countVariableUsage } from "./css/parseVariables";
export { categorizeVariable } from "./css/categorizeVariable";
export { computeCssStats } from "./css/stats";
export { analyzeThemeFromCss } from "./theme/analyzeTheme";
export {
  pickPrimaryColor,
  pickSecondaryColor,
  colorPrimaryScore,
  colorVisualScore,
  clusterByHue,
  filterBrandRoleCandidates,
  pickFamilyRepresentative,
  isCssOnlyGhostColor,
  structuralUiScore,
} from "./theme/visualBrandRoles";
export { buildAnalysisReport } from "./report/buildReport";
