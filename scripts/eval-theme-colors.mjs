#!/usr/bin/env node
/**
 * Evalúa colores de marca de cualquier URL (CSS + viewport con Playwright si está disponible).
 *
 * Uso:
 *   npx tsx scripts/eval-theme-colors.mjs https://www.flytap.com
 *   npx tsx scripts/eval-theme-colors.mjs https://www.aa.com --no-probe
 */
import { collectCssFromPage } from "../src/lib/fetch/cssCollector.ts";
import { probeRenderedColorsWithTimeout } from "../src/lib/renderProbe.ts";
import { analyzeThemeFromCss } from "../src/lib/theme/analyzeTheme.ts";
import {
  buildRenderedColorLookup,
  extractColorsFromCss,
  getRenderedColorWeight,
  isNeutralColor,
} from "../src/lib/colorExtract.ts";
import {
  clusterByHue,
  colorSecondaryScore,
  colorVisualScore,
} from "../src/lib/theme/visualBrandRoles.ts";
import { parseColorToHsl } from "../src/lib/color/colorMath.ts";

const url = process.argv[2];
const noProbe = process.argv.includes("--no-probe");

if (!url) {
  console.error("Uso: npx tsx scripts/eval-theme-colors.mjs <url> [--no-probe]");
  process.exit(1);
}

console.log("Analizando", url, noProbe ? "(solo CSS)" : "(CSS + viewport)…\n");

const { css, html, variables } = await collectCssFromPage(url);
const rendered = noProbe ? null : await probeRenderedColorsWithTimeout(url, 25_000);

const theme = analyzeThemeFromCss(
  css,
  variables,
  html,
  rendered?.colors,
  rendered?.bodyTextColors ?? rendered?.textColors,
  rendered?.buttonTextColors,
  rendered?.backgroundColors,
  rendered?.buttonFillColors,
  rendered?.headingTextColors,
);

console.log("── Resultado ──");
console.log("Primario:  ", theme.primary_color ?? "—");
console.log("Secundario:", theme.secondary_color ?? "—");
console.log("Viewport:  ", theme.viewportSampled ? "sí" : "no");

if (rendered?.backgroundColors) {
  const bg = buildRenderedColorLookup(rendered.backgroundColors);
  const extracted = extractColorsFromCss(css, variables, html, rendered.colors);
  const chrom = [...extracted.values()].filter((c) => !isNeutralColor(c.hsl) && c.hsl.s >= 28);

  const renderedShare = (hex) =>
    bg.total > 0 ? getRenderedColorWeight(bg.lookup, hex) / bg.total : 0;
  const allLookup = buildRenderedColorLookup(rendered.colors);
  const viewShare = (hex) =>
    allLookup.total > 0 ? getRenderedColorWeight(allLookup.lookup, hex) / allLookup.total : 0;

  const btnLookup = buildRenderedColorLookup(rendered.buttonFillColors ?? {});
  const btnShare = (hex) =>
    btnLookup.total > 0 ? getRenderedColorWeight(btnLookup.lookup, hex) / btnLookup.total : 0;

  const visualCtx = {
    renderedShare: viewShare,
    renderedBackgroundShare: renderedShare,
    renderedButtonFillShare: btnShare,
    tokenRoleHintByHex: new Map(),
    renderedSampled: allLookup.sampled,
    renderedBackgroundSampled: bg.sampled,
    renderedButtonFillSampled: btnLookup.sampled,
  };

  console.log("\n── Familias cromáticas (fondo + CSS + viewport) ──");
  const clusters = clusterByHue(chrom);
  const ranked = clusters
    .map((members) => {
      const rep = [...members].sort(
        (a, b) => colorVisualScore(b, visualCtx) - colorVisualScore(a, visualCtx),
      )[0];
      const familyScore = members.reduce((s, c) => s + colorVisualScore(c, visualCtx), 0);
      const bgSum = members.reduce((s, c) => s + renderedShare(c.hex), 0);
      return { rep, familyScore, bgSum, count: members.length };
    })
    .sort((a, b) => b.familyScore - a.familyScore)
    .slice(0, 8);

  for (const { rep, familyScore, bgSum, count } of ranked) {
    if (!rep) continue;
    const hsl = parseColorToHsl(rep.hex);
    const h = hsl ? Math.round(hsl.h) : "?";
    console.log(
      `  ${rep.hex}  h≈${h}°  familia=${count}  score=${Math.round(familyScore)}  bg%≈${(bgSum * 100).toFixed(1)}`,
    );
  }

  console.log("\n── Top fondos en pantalla ──");
  for (const [hex, w] of Object.entries(rendered.backgroundColors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)) {
    const pct = bg.total > 0 ? ((w / bg.total) * 100).toFixed(1) : "0";
    console.log(`  ${hex}  ${pct}%`);
  }

  if (rendered.buttonFillColors && Object.keys(rendered.buttonFillColors).length > 0) {
    console.log("\n── Top rellenos botón/CTA ──");
    for (const [hex, w] of Object.entries(rendered.buttonFillColors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)) {
      const pct = btnLookup.total > 0 ? ((w / btnLookup.total) * 100).toFixed(1) : "0";
      const sec = Math.round(colorSecondaryScore({ hex, hsl: parseColorToHsl(hex), score: 0, count: 0, semanticWeight: 0, textScore: 0, buttonTextScore: 0 }, visualCtx));
      console.log(`  ${hex}  ${pct}%  secScore≈${sec}`);
    }
  }
}
