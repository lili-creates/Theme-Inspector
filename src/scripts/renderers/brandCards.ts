import { ROLE_LABELS, UI_SEMANTIC_HINT_LABELS } from "../../lib/constants";
import { escapeCssColorHex, escapeHtml } from "../../lib/security/escapeHtml";

type BrandColor = {
  hex: string;
  role?: string | null;
  source?: string;
  visibleWeight?: number;
  usage?: number;
};

type DeclaredToken = {
  name: string;
  hex: string;
  semanticHint?: string | null;
  roleHint?: string | null;
  usedOnScreen?: boolean;
  visibleWeight?: number;
};

type RenderBrandOptions = {
  viewportSampled?: boolean;
};

function formatVisibleMeta(c: BrandColor, viewportSampled: boolean): string {
  const usage = c.usage ?? 0;
  if (c.source !== "visible") {
    return `Solo en CSS · ${usage} usos`;
  }
  if (!viewportSampled) {
    return `Sin muestra de viewport · ${usage} usos CSS`;
  }
  const pct = c.visibleWeight ?? 0;
  if (pct > 0) {
    return `${pct}% en pantalla · ${usage} usos CSS`;
  }
  if (c.role && c.role !== "palette") {
    return `Rol asignado · ${usage} usos CSS`;
  }
  return `${usage} usos CSS`;
}

export function renderBrandCard(c: BrandColor, options: RenderBrandOptions = {}): string {
  const viewportSampled = options.viewportSampled ?? false;
  const hex = escapeCssColorHex(c.hex);
  const roleLabel = escapeHtml(ROLE_LABELS[c.role ?? ""] || "Color");
  const isRole = c.role && c.role !== "palette";
  const isPrimary = c.role === "primary";
  const detail = formatVisibleMeta(c, viewportSampled);
  const badge = isRole ? `<span class="roleBadge">${roleLabel}</span>` : "";
  return `
        <button class="brandCard${isRole ? " isRole" : ""}${isPrimary ? " isPrimary" : ""}" type="button" data-hex="${hex}" style="--card-color:${hex}" title="Clic para copiar ${hex}">
          <span class="chipArea"><span class="chip"></span>${badge}</span>
          <span class="cardInfo">
            <span class="hex">${hex}</span>
            <span class="meta">${escapeHtml(detail)}</span>
          </span>
          <span class="copyHint" aria-hidden="true">Copiar</span>
        </button>
      `;
}

export function renderDeclaredBrandToken(
  t: DeclaredToken,
  options: RenderBrandOptions = {},
): string {
  const viewportSampled = options.viewportSampled ?? false;
  const hex = escapeCssColorHex(t.hex);
  const hints: string[] = [];
  if (t.semanticHint) {
    hints.push(UI_SEMANTIC_HINT_LABELS[t.semanticHint] || t.semanticHint);
  }
  if (t.roleHint) hints.push(`pista ${t.roleHint}`);
  if (!viewportSampled) {
    hints.push("sin muestra de viewport");
  } else if (t.usedOnScreen && (t.visibleWeight ?? 0) > 0) {
    hints.push(`${t.visibleWeight}% en pantalla`);
  } else if (t.usedOnScreen) {
    hints.push("presencia baja en pantalla");
  } else {
    hints.push("no dominante en pantalla");
  }
  const meta = hints.length > 0 ? hints.join(" · ") : "token de marca";
  const tokenLabel = escapeHtml(t.name.replace(/^--/, ""));
  return `
        <button class="brandCard isToken isRole" type="button" data-hex="${hex}" style="--card-color:${hex}" title="Clic para copiar ${hex}">
          <span class="chipArea"><span class="chip"></span><span class="roleBadge">Token</span></span>
          <span class="cardInfo">
            <span class="tokenName">${tokenLabel}</span>
            <span class="hex">${hex}</span>
            <span class="meta">${escapeHtml(meta)}</span>
          </span>
          <span class="copyHint" aria-hidden="true">Copiar</span>
        </button>
      `;
}
