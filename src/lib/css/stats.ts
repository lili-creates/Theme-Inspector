import type { CssStats } from "../../types/analysis";

export function computeCssStats(css: string, stylesheetCount: number): CssStats {
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
    cssSizeBytes: new TextEncoder().encode(css).length,
  };
}
