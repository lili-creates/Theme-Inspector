import type { ColorUsage } from "../colorExtract";
import { hueDistance, isStockCssKeywordColor } from "../colorExtract";
import { isFeedbackChromaticColor } from "../semanticColors";

/**
 * Reglas globales de roles de marca (sin heurísticas por aerolínea o sector):
 * - Peso en viewport por hex exacto (fondos, botones, títulos, vista general).
 * - CSS solo cuenta si el color no tiene presencia visual medible.
 * - Primario = familia cromática dominante en superficies; representante = tono más visible.
 * - Secundario = otra familia de matiz con contraste; requiere presencia en pantalla o en UI tipográfica.
 */

/** Secundario en otra familia de matiz (no un segundo tono del primario). */
const MIN_SECONDARY_HUE_DISTANCE = 38;
const MIN_VISUAL_MASS = 0.01;
const MIN_PRIMARY_SURFACE_MASS = 0.0035;
const MIN_SECONDARY_SURFACE_MASS = 0.006;
const MIN_SECONDARY_VIEW_SHARE = 0.022;
const MIN_HEADING_TEXT_SHARE = 0.002;
const MIN_CSS_ONLY_STRUCTURAL = 12;
const MIN_CSS_ONLY_SCORE = 100;

export type VisualBrandContext = {
  renderedShare: (hex: string) => number;
  renderedBackgroundShare: (hex: string) => number;
  renderedButtonFillShare: (hex: string) => number;
  renderedHeadingTextShare: (hex: string) => number;
  /** Misma familia de matiz en títulos/logo (hex del CSS ≠ hex renderizado). */
  renderedHeadingTextShareFamily?: (hex: string) => number;
  renderedButtonFillShareFamily?: (hex: string) => number;
  renderedBackgroundShareFamily?: (hex: string) => number;
  tokenRoleHintByHex: Map<string, "primary" | "secondary" | null>;
  renderedSampled: boolean;
  renderedBackgroundSampled: boolean;
  renderedButtonFillSampled: boolean;
  renderedHeadingTextSampled: boolean;
};

function hasAnyViewportSample(ctx: VisualBrandContext): boolean {
  return (
    ctx.renderedSampled ||
    ctx.renderedBackgroundSampled ||
    ctx.renderedButtonFillSampled ||
    ctx.renderedHeadingTextSampled
  );
}

function headingShare(ctx: VisualBrandContext, hex: string): number {
  return ctx.renderedHeadingTextShareFamily?.(hex) ?? ctx.renderedHeadingTextShare(hex);
}

function buttonFillShare(ctx: VisualBrandContext, hex: string): number {
  return ctx.renderedButtonFillShareFamily?.(hex) ?? ctx.renderedButtonFillShare(hex);
}

function backgroundShare(ctx: VisualBrandContext, hex: string): number {
  return ctx.renderedBackgroundShareFamily?.(hex) ?? ctx.renderedBackgroundShare(hex);
}

export function surfacePresenceMass(ctx: VisualBrandContext, hex: string): number {
  return (
    backgroundShare(ctx, hex) +
    buttonFillShare(ctx, hex) * 1.35 +
    headingShare(ctx, hex) * 1.5
  );
}

export function visualPresenceMass(ctx: VisualBrandContext, hex: string): number {
  const surface = surfacePresenceMass(ctx, hex);
  const view = ctx.renderedShare(hex);
  return surface + view * (surface >= MIN_PRIMARY_SURFACE_MASS ? 0.45 : 0.12);
}

/** Uso del color en selectores de UI (títulos, botones, texto), no solo literales sueltos en CSS. */
export function structuralUiScore(c: ColorUsage): number {
  return c.headingTextScore * 1.1 + c.buttonTextScore * 1.05 + c.textScore * 0.2;
}

/**
 * Color casi solo en hojas de estilo, sin peso en pantalla ni en capas de UI nombradas.
 * Genérico: no depende del matiz (evita azules de framework y rojos/amarillos fantasma por igual).
 */
function isRepeatedBrandLiteral(c: ColorUsage): boolean {
  return c.count >= 4 && c.hsl.s >= 48 && c.hsl.l >= 22 && c.hsl.l <= 78;
}

/** Literal repetido con luminosidad de acento de marca (no teal/gris oscuro de UI). */
function isVisibleBrandLiteral(c: ColorUsage): boolean {
  return isRepeatedBrandLiteral(c) && c.hsl.l >= 30;
}

export function isCssOnlyGhostColor(c: ColorUsage, ctx: VisualBrandContext): boolean {
  if (isStockCssKeywordColor(c.hex)) return true;
  if (c.headingTextScore >= 5 || c.buttonTextScore >= 6) return false;
  if (!hasAnyViewportSample(ctx) && isRepeatedBrandLiteral(c)) return false;

  const structural = structuralUiScore(c);

  if (hasAnyViewportSample(ctx)) {
    if (visualPresenceMass(ctx, c.hex) >= MIN_VISUAL_MASS) return false;
    if (headingShare(ctx, c.hex) >= MIN_HEADING_TEXT_SHARE) return false;
    return c.score < 140 && structural < 35;
  }

  return structural < 22 && c.score < 120;
}

export function hasMeaningfulVisualPresence(
  ctx: VisualBrandContext,
  color: ColorUsage | string,
): boolean {
  const hex = typeof color === "string" ? color : color.hex;
  const usage = typeof color === "string" ? undefined : color;

  if (!hasAnyViewportSample(ctx)) {
    if (usage && isCssOnlyGhostColor(usage, ctx)) return false;
    if (usage) {
      return (
        structuralUiScore(usage) >= MIN_CSS_ONLY_STRUCTURAL ||
        usage.score >= MIN_CSS_ONLY_SCORE ||
        isRepeatedBrandLiteral(usage)
      );
    }
    return true;
  }

  const surface = surfacePresenceMass(ctx, hex);
  if (surface >= MIN_PRIMARY_SURFACE_MASS) return true;
  if (headingShare(ctx, hex) >= MIN_HEADING_TEXT_SHARE) return true;
  if (usage && structuralUiScore(usage) >= 48 && usage.score >= 140) return true;
  return false;
}

export function hasSecondaryVisualPresence(ctx: VisualBrandContext, c: ColorUsage): boolean {
  if (!hasMeaningfulVisualPresence(ctx, c)) return false;
  if (!hasAnyViewportSample(ctx)) {
    return (
      !isCssOnlyGhostColor(c, ctx) &&
      (structuralUiScore(c) >= MIN_CSS_ONLY_STRUCTURAL ||
        c.score >= MIN_CSS_ONLY_SCORE ||
        isVisibleBrandLiteral(c))
    );
  }

  const surface = surfacePresenceMass(ctx, c.hex);
  if (surface >= MIN_SECONDARY_SURFACE_MASS) return true;
  if (headingShare(ctx, c.hex) >= MIN_HEADING_TEXT_SHARE * 1.15) return true;
  return false;
}

export function filterBrandRoleCandidates(
  candidates: ColorUsage[],
  ctx: VisualBrandContext,
): ColorUsage[] {
  return candidates.filter(
    (c) => !isStockCssKeywordColor(c.hex) && hasMeaningfulVisualPresence(ctx, c),
  );
}

export function filterSecondaryCandidates(
  candidates: ColorUsage[],
  ctx: VisualBrandContext,
): ColorUsage[] {
  return candidates.filter((c) => {
    if (isCssOnlyGhostColor(c, ctx)) return false;
    if (!hasAnyViewportSample(ctx)) {
      if (isFeedbackChromaticColor(c.hsl) && c.buttonTextScore < 8 && c.score < 400) {
        return false;
      }
      return hasSecondaryVisualPresence(ctx, c);
    }
    if (!hasSecondaryVisualPresence(ctx, c)) return false;
    if (isFeedbackChromaticColor(c.hsl) && visualPresenceMass(ctx, c.hex) < 0.02) {
      return false;
    }
    return true;
  });
}

const HUE_CLUSTER_DISTANCE = 28;

export function clusterByHue(candidates: ColorUsage[], maxDistance = HUE_CLUSTER_DISTANCE): ColorUsage[][] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const clusters: ColorUsage[][] = [];

  for (const c of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const rep = cluster[0]!;
      if (hueDistance(c.hsl.h, rep.hsl.h) <= maxDistance) {
        cluster.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([c]);
  }
  return clusters;
}

/** Primario: superficies (fondo + relleno de CTA), no enlaces ni ruido del CSS. */
export function colorPrimaryScore(c: ColorUsage, ctx: VisualBrandContext): number {
  const bg = backgroundShare(ctx, c.hex);
  const fill = buttonFillShare(ctx, c.hex);
  const heading = headingShare(ctx, c.hex);
  const view = ctx.renderedShare(c.hex);
  const css = c.score;
  const structural = structuralUiScore(c);
  const token = ctx.tokenRoleHintByHex.get(c.hex.toUpperCase());

  const surface = bg * 1350 + fill * 1500 + heading * 480;
  const sampled = hasAnyViewportSample(ctx);
  const cssWeight = sampled ? 0.22 : 0.28;
  const linkOnly =
    sampled && surface < 0.006 && view > 0.01 && fill < 0.003 && heading < 0.002;
  const linkPenalty = linkOnly ? view * 520 + Math.min(css, 100) * 0.25 : 0;
  const tokenAdd =
    token === "primary" ? 0.12 * (surface + 30) : token === "secondary" ? 0.03 * (surface + 10) : 0;
  const cssLiteralWeight = sampled ? 0 : c.count * 14 + (isVisibleBrandLiteral(c) ? 48 : 0);

  return (
    surface +
    css * cssWeight +
    cssLiteralWeight +
    structural * (sampled ? 6 : 20) +
    Math.max(0, c.hsl.s - 30) * 0.2 +
    tokenAdd -
    linkPenalty +
    view * (linkOnly ? 15 : 55)
  );
}

export function colorVisualScore(c: ColorUsage, ctx: VisualBrandContext): number {
  const bg = backgroundShare(ctx, c.hex);
  const view = ctx.renderedShare(c.hex);
  const fill = buttonFillShare(ctx, c.hex);
  const heading = headingShare(ctx, c.hex);
  const css = c.score;
  const structural = structuralUiScore(c);
  const token = ctx.tokenRoleHintByHex.get(c.hex.toUpperCase());

  const tokenBoost =
    token === "primary" ? 0.14 : token === "secondary" ? 0.05 : 0;

  const cssWeight = ctx.renderedBackgroundSampled ? 0.1 : ctx.renderedSampled ? 0.32 : 0.42;

  const surface = bg + fill + heading;
  const accentOnly =
    hasAnyViewportSample(ctx) && surface < 0.005 && view > 0.02 && fill < 0.004 && heading < 0.002;
  const accentPenalty = accentOnly ? view * 420 + css * 0.18 : 0;

  const viewBgRatio = view / (bg + 0.006);
  const linkHeavyPenalty =
    hasAnyViewportSample(ctx) &&
    surface < 0.006 &&
    view > 0.012 &&
    (viewBgRatio > 5 || (!ctx.renderedBackgroundSampled && view > 0.018))
      ? view * 380 + Math.min(css, 120) * 0.22
      : 0;

  const saturationBonus = Math.max(0, c.hsl.s - 28) * 0.22;
  const readabilityBonus = c.hsl.l >= 14 && c.hsl.l <= 62 ? 6 : 0;
  const structuralBoost = structural * (hasAnyViewportSample(ctx) ? 4 : 16);

  const visual =
    css * cssWeight +
    bg * 920 +
    view * (surface >= MIN_PRIMARY_SURFACE_MASS ? 160 : 35) +
    fill * 140 +
    heading * 1100 +
    saturationBonus +
    readabilityBonus +
    structuralBoost;

  const tokenAdd = tokenBoost * (bg * 900 + view * 280 + heading * 400 + css * 0.4 + 40);

  return visual + tokenAdd - accentPenalty - linkHeavyPenalty;
}

export function colorSecondaryScore(c: ColorUsage, ctx: VisualBrandContext): number {
  if (hasAnyViewportSample(ctx) && !hasSecondaryVisualPresence(ctx, c)) return -1e9;
  if (!hasAnyViewportSample(ctx) && !isVisibleBrandLiteral(c) && c.score < MIN_CSS_ONLY_SCORE) {
    return -1e9;
  }

  const fill = buttonFillShare(ctx, c.hex);
  const bg = backgroundShare(ctx, c.hex);
  const heading = headingShare(ctx, c.hex);
  const view = ctx.renderedShare(c.hex);
  const structural = structuralUiScore(c);
  const surface = bg * 520 + fill * 680 + heading * 920;
  const linkOnly =
    hasAnyViewportSample(ctx) && surface < 0.005 && view > 0.015 && fill < 0.003;

  return (
    surface +
    heading * 420 +
    structural * (hasAnyViewportSample(ctx) ? 8 : 12) +
    c.score * (hasAnyViewportSample(ctx) ? 0.08 : 0.2) -
    (linkOnly ? view * 450 : 0)
  );
}

export function familyPrimaryScore(members: ColorUsage[], ctx: VisualBrandContext): number {
  if (!hasAnyViewportSample(ctx)) {
    return members.reduce(
      (sum, c) =>
        sum + colorPrimaryScore(c, ctx) + c.count * 10 + (isVisibleBrandLiteral(c) ? 35 : 0),
      0,
    );
  }
  return members.reduce((sum, c) => sum + colorPrimaryScore(c, ctx), 0);
}

export function familyVisualScore(
  members: ColorUsage[],
  ctx: VisualBrandContext,
  scoreFn: (c: ColorUsage, ctx: VisualBrandContext) => number = colorVisualScore,
): number {
  return members.reduce((sum, c) => sum + scoreFn(c, ctx), 0);
}

/** Representante de familia: mayor presencia visual, no el tono más oscuro del CSS. */
export function pickFamilyRepresentative(
  members: ColorUsage[],
  ctx: VisualBrandContext,
): ColorUsage {
  const pool = members.filter((c) => !isStockCssKeywordColor(c.hex));
  if (pool.length === 0) return members[0]!;

  const scoreRep = (c: ColorUsage): number => {
    const fill = buttonFillShare(ctx, c.hex);
    const bg = backgroundShare(ctx, c.hex);
    const heading = headingShare(ctx, c.hex);
    const sampled = hasAnyViewportSample(ctx);
    const surfaceMass = bg + fill * 1.2 + heading * 0.65;
    const darkShadePenalty =
      sampled && c.hsl.l < 32 && fill < 0.008 && bg < 0.04 && heading < 0.003
        ? surfaceMass * 900 + 80
        : 0;
    const midChromaBonus =
      c.hsl.l >= 34 && c.hsl.l <= 58 && c.hsl.s >= 42 ? 35 + (fill + heading) * 100 : 0;

    return (
      surfaceMass * 1100 +
      fill * 950 +
      bg * 500 +
      heading * 800 +
      midChromaBonus +
      structuralUiScore(c) * (sampled ? 2 : 14) +
      c.score * (sampled ? 0.08 : 0.55) +
      c.count * (sampled ? 0.05 : 0.4) -
      darkShadePenalty
    );
  };

  return [...pool].sort((a, b) => scoreRep(b) - scoreRep(a))[0]!;
}

export function pickPrimaryColor(
  candidates: ColorUsage[],
  ctx: VisualBrandContext,
): ColorUsage | null {
  const pool = filterBrandRoleCandidates(candidates, ctx);
  if (pool.length === 0) {
    const fallback = candidates.filter(
      (c) => !isStockCssKeywordColor(c.hex) && !isCssOnlyGhostColor(c, ctx),
    );
    if (fallback.length === 0) return null;
    const clusters = clusterByHue(fallback);
    const bestMembers =
      clusters
        .map((members) => ({ members, score: familyPrimaryScore(members, ctx) }))
        .sort((a, b) => b.score - a.score)[0]?.members ?? fallback;
    return pickFamilyRepresentative(bestMembers, ctx);
  }

  const clusters = clusterByHue(pool);
  const bestMembers =
    clusters
      .map((members) => ({ members, score: familyPrimaryScore(members, ctx) }))
      .sort((a, b) => b.score - a.score)[0]?.members ?? pool;

  return pickFamilyRepresentative(bestMembers, ctx);
}

/** Si el secundario domina superficies frente al primario, intercambiar roles. */
/**
 * Secundario dominante en cabecera / logo (p. ej. amarillo en franja de header),
 * aunque el CSS del sitio casi no lo declare.
 */
export function pickSecondaryFromHeadingAccent(
  candidates: ColorUsage[],
  primary: ColorUsage | null,
  ctx: VisualBrandContext,
): ColorUsage | null {
  if (!primary || !ctx.renderedHeadingTextSampled) return null;

  let best: ColorUsage | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    if (c.hex === primary.hex || isStockCssKeywordColor(c.hex)) continue;
    if (hueDistance(c.hsl.h, primary.hsl.h) < MIN_SECONDARY_HUE_DISTANCE) continue;

    const heading = headingShare(ctx, c.hex);
    if (heading < MIN_HEADING_TEXT_SHARE * 1.1) continue;

    const surface = surfacePresenceMass(ctx, c.hex);
    const view = ctx.renderedShare(c.hex);
    const linkOnly = surface < 0.004 && view > 0.018;
    if (linkOnly) continue;

    const score = heading * 1600 + surface * 700 + structuralUiScore(c) * 5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

export function reconcileSecondaryWithHeadingAccent(
  secondary: ColorUsage | null,
  candidates: ColorUsage[],
  primary: ColorUsage | null,
  ctx: VisualBrandContext,
): ColorUsage | null {
  const fromHeading = pickSecondaryFromHeadingAccent(candidates, primary, ctx);
  if (!fromHeading) return secondary;
  if (!secondary) return fromHeading;

  const secHeading = headingShare(ctx, secondary.hex);
  const accentHeading = headingShare(ctx, fromHeading.hex);
  const secSurface = surfacePresenceMass(ctx, secondary.hex);
  const accentSurface = surfacePresenceMass(ctx, fromHeading.hex);

  if (
    accentHeading >= MIN_HEADING_TEXT_SHARE * 1.4 &&
    accentHeading > secHeading * 1.25 &&
    accentHeading + accentSurface * 0.5 > secHeading + secSurface * 0.5
  ) {
    return fromHeading;
  }
  return secondary;
}

export function reconcilePrimarySecondary(
  primary: ColorUsage | null,
  secondary: ColorUsage | null,
  ctx: VisualBrandContext,
): { primary: ColorUsage | null; secondary: ColorUsage | null } {
  if (!primary || !secondary) return { primary, secondary };
  if (hueDistance(primary.hsl.h, secondary.hsl.h) < MIN_SECONDARY_HUE_DISTANCE) {
    return { primary, secondary: null };
  }

  const pScore = colorPrimaryScore(primary, ctx);
  const sScore = colorPrimaryScore(secondary, ctx);
  if (sScore > pScore * 1.22) {
    return { primary: secondary, secondary: primary };
  }
  return { primary, secondary };
}

function pickBestByScore(
  list: ColorUsage[],
  ctx: VisualBrandContext,
  scoreFn: (c: ColorUsage, ctx: VisualBrandContext) => number,
): ColorUsage | null {
  if (list.length === 0) return null;
  return [...list].sort((a, b) => scoreFn(b, ctx) - scoreFn(a, ctx))[0] ?? null;
}

export function pickSecondaryColor(
  candidates: ColorUsage[],
  primary: ColorUsage | null,
  ctx: VisualBrandContext,
  secondaryHintHexes: Set<string>,
): ColorUsage | null {
  let pool = filterSecondaryCandidates(
    candidates.filter((c) => !primary || c.hex !== primary.hex),
    ctx,
  );
  if (pool.length === 0) {
    pool = candidates
      .filter((c) => !primary || c.hex !== primary.hex)
      .filter(
        (c) =>
          !isStockCssKeywordColor(c.hex) &&
          !isCssOnlyGhostColor(c, ctx) &&
          hasMeaningfulVisualPresence(ctx, c),
      );
  }
  if (pool.length === 0) return null;

  const contrastsPrimary = (c: ColorUsage) =>
    !primary || hueDistance(c.hsl.h, primary.hsl.h) >= MIN_SECONDARY_HUE_DISTANCE;

  const fromHint =
    [...pool]
      .filter(contrastsPrimary)
      .sort((a, b) => colorSecondaryScore(b, ctx) - colorSecondaryScore(a, ctx))
      .find(
        (c) =>
          ctx.tokenRoleHintByHex.get(c.hex.toUpperCase()) === "secondary" ||
          secondaryHintHexes.has(c.hex.toUpperCase()),
      ) ?? null;
  if (fromHint) return fromHint;

  const clusters = clusterByHue(pool);
  const otherFamilies = clusters.filter((members) => {
    if (!primary) return true;
    return hueDistance(members[0]!.hsl.h, primary.hsl.h) >= MIN_SECONDARY_HUE_DISTANCE;
  });

  if (otherFamilies.length > 0) {
    const best = otherFamilies
      .map((members) => ({
        members,
        score: familyVisualScore(members, ctx, colorSecondaryScore),
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (best) {
      return pickFamilyRepresentative(best.members, ctx);
    }
  }

  const contrasting = pool.filter(contrastsPrimary);
  return pickBestByScore(contrasting, ctx, colorSecondaryScore);
}
