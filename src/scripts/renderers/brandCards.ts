import { ROLE_LABELS, UI_SEMANTIC_HINT_LABELS } from "../../lib/constants";

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

export function renderBrandCard(c: BrandColor): string {
  const roleLabel = ROLE_LABELS[c.role ?? ""] || "Color";
  const isRole = c.role && c.role !== "palette";
  const isPrimary = c.role === "primary";
  const detail =
    c.source === "visible"
      ? `${c.visibleWeight ?? 0}% en pantalla · ${c.usage} usos CSS`
      : `Solo en CSS · ${c.usage} usos`;
  const badge = isRole ? `<span class="roleBadge">${roleLabel}</span>` : "";
  return `
        <button class="brandCard${isRole ? " isRole" : ""}${isPrimary ? " isPrimary" : ""}" type="button" data-hex="${c.hex}" style="--card-color:${c.hex}" title="Clic para copiar ${c.hex}">
          <span class="chipArea"><span class="chip"></span>${badge}</span>
          <span class="cardInfo">
            <span class="hex">${c.hex}</span>
            <span class="meta">${detail}</span>
          </span>
          <span class="copyHint" aria-hidden="true">Copiar</span>
        </button>
      `;
}

export function renderDeclaredBrandToken(t: DeclaredToken): string {
  const hints: string[] = [];
  if (t.semanticHint) {
    hints.push(UI_SEMANTIC_HINT_LABELS[t.semanticHint] || t.semanticHint);
  }
  if (t.roleHint) hints.push(`pista ${t.roleHint}`);
  if (t.usedOnScreen) hints.push(`${t.visibleWeight}% en pantalla`);
  else hints.push("no dominante en pantalla");
  const meta = hints.length > 0 ? hints.join(" · ") : "token de marca";
  const tokenLabel = t.name.replace(/^--/, "");
  return `
        <button class="brandCard isToken isRole" type="button" data-hex="${t.hex}" style="--card-color:${t.hex}" title="Clic para copiar ${t.hex}">
          <span class="chipArea"><span class="chip"></span><span class="roleBadge">Token</span></span>
          <span class="cardInfo">
            <span class="tokenName">${tokenLabel}</span>
            <span class="hex">${t.hex}</span>
            <span class="meta">${meta}</span>
          </span>
          <span class="copyHint" aria-hidden="true">Copiar</span>
        </button>
      `;
}
