import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  UI_SEMANTIC_HINT_LABELS,
} from "../lib/constants";
import { postAnalyze } from "../lib/client/analyzeClient";
import { escapeCssColorHex, escapeHtml } from "../lib/security/escapeHtml";
import { isRawUrlInputAllowed } from "../lib/urlSafety";
import { loadCachedReport, persistReportCache } from "../lib/client/sessionCache";
import { ensureUrlProtocol } from "../lib/url";
import { renderBrandCard, renderDeclaredBrandToken } from "./renderers/brandCards";
import { applyThemeToShowcase, updateShowcaseSiteLink } from "./showcaseTheme";

export function initResultsPage(): void {
  const els = {
    loading: document.getElementById("study-loading"),
    error: document.getElementById("study-error"),
    content: document.getElementById("study-content"),
    url: document.getElementById("study-url"),
    statsGrid: document.getElementById("stats-grid"),
    categorySections: document.getElementById("category-sections"),
    brandTokensGrid: document.getElementById("brand-tokens-grid"),
    brandVisibleGrid: document.getElementById("brand-visible-grid"),
    brandLegacyGrid: document.getElementById("brand-legacy-grid"),
    search: document.getElementById("var-search") as HTMLInputElement | null,
    showcase: document.getElementById("theme-showcase"),
  };

  let currentReport: Record<string, unknown> | null = null;

  const show = (el: HTMLElement | null, visible: boolean) => {
    if (!el) return;
    el.classList.toggle("hidden", !visible);
  };

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const renderStats = (stats: Record<string, number>) => {
    if (!els.statsGrid) return;
    const items = [
      { label: "Reglas CSS", value: stats.rules },
      { label: "Selectores", value: stats.selectors },
      { label: "Declaraciones", value: stats.declarations },
      { label: "Variables (--*)", value: stats.customPropertyDeclarations },
      { label: "Usos de var()", value: stats.varReferences },
      { label: "Hojas de estilo", value: stats.stylesheets },
      { label: "Tamaño CSS", value: formatBytes(stats.cssSizeBytes) },
      {
        label: "Tokens únicos",
        value: (currentReport?.variables as unknown[] | undefined)?.length ?? 0,
      },
    ];

    els.statsGrid.innerHTML = items
      .map(
        (item) => `
        <article class="statCard">
          <span class="value">${item.value}</span>
          <span class="label">${item.label}</span>
        </article>
      `,
      )
      .join("");
  };

  const renderBrandSections = (theme: Record<string, unknown>) => {
    const tokens = Array.isArray(theme?.brandTokens) ? theme.brandTokens : [];
    const visible = Array.isArray(theme?.brandVisible) ? theme.brandVisible : [];
    const legacy = Array.isArray(theme?.brandLegacy) ? theme.brandLegacy : [];
    const brandOpts = { viewportSampled: Boolean(theme?.viewportSampled) };

    if (els.brandTokensGrid) {
      els.brandTokensGrid.innerHTML =
        tokens.length > 0
          ? tokens.map((t) => renderDeclaredBrandToken(t, brandOpts)).join("")
          : `<p style="color:rgba(255,255,255,.65);font-size:13px;">No se encontraron variables CSS con nombre de marca.</p>`;
    }

    if (els.brandVisibleGrid) {
      els.brandVisibleGrid.innerHTML =
        visible.length > 0
          ? visible.map((c) => renderBrandCard(c, brandOpts)).join("")
          : `<p style="color:rgba(255,255,255,.65);font-size:13px;">No se detectaron colores cromáticos visibles en el viewport.</p>`;
    }

    if (els.brandLegacyGrid) {
      els.brandLegacyGrid.innerHTML =
        legacy.length > 0
          ? legacy.map((c) => renderBrandCard(c, brandOpts)).join("")
          : `<p style="color:rgba(255,255,255,.65);font-size:13px;">No hay colores legacy relevantes fuera de la UI visible.</p>`;
    }

    document.querySelectorAll(".brandCard").forEach((btn) => {
      btn.addEventListener("click", () => {
        const hex = btn.getAttribute("data-hex");
        if (hex) copyText(hex);
      });
    });
  };

  const applyIdentityNote = (theme: Record<string, unknown>) => {
    const primary = theme?.primary_color as string | undefined;
    const tokenPrimary = (
      (theme?.brandTokens as { roleHint?: string; hex?: string; name?: string; semanticHint?: string }[]) ||
      []
    ).find((t) => t.roleHint === "primary");
    if (!primary || !tokenPrimary || tokenPrimary.hex?.toUpperCase() === primary.toUpperCase()) {
      return;
    }
    const note = document.getElementById("identity-note");
    if (!note) return;
    note.textContent = `Primario en pantalla: ${primary}. En tokens CSS también existe ${tokenPrimary.name} (${tokenPrimary.hex})${
      tokenPrimary.semanticHint
        ? ` — ${UI_SEMANTIC_HINT_LABELS[tokenPrimary.semanticHint]}`
        : ""
    }.`;
    note.classList.remove("hidden");
  };

  const renderVariableCard = (v: {
    isColor: boolean;
    name: string;
    value: string;
    usage: number;
  }) => {
    const swatchClass = v.isColor ? "swatch" : "swatch isToken";
    const cardClass = v.isColor ? "varCard isColor" : "varCard";
    const swatchStyle = v.isColor ? `--swatch-color:${escapeCssColorHex(v.value)}` : "";
    const name = escapeHtml(v.name);
    const value = escapeHtml(v.value);
    return `
        <button class="${cardClass}" type="button" style="${swatchStyle}" data-copy-name="${name}" data-copy-value="${value}" title="Clic para copiar">
          <span class="${swatchClass}"></span>
          <span class="varBody">
            <span class="name">${name}</span>
            <span class="value">${value}</span>
            <span class="usage">${v.usage} usos en CSS</span>
          </span>
        </button>
      `;
  };

  const renderCategories = (report: Record<string, unknown>, filter = "") => {
    if (!els.categorySections) return;
    const q = filter.trim().toLowerCase();
    const byCategory = report.variablesByCategory as Record<
      string,
      { name: string; value: string; usage: number; isColor: boolean }[]
    >;

    const blocks = CATEGORY_ORDER.map((cat) => {
      const vars = (byCategory?.[cat] || []).filter((v) => {
        if (!q) return true;
        return v.name.toLowerCase().includes(q) || v.value.toLowerCase().includes(q);
      });
      if (vars.length === 0) return "";

      return `
          <section class="categoryBlock" data-category="${cat}">
            <div class="categoryHead">
              <h3>${CATEGORY_LABELS[cat]}</h3>
              <span class="count">${vars.length} variables</span>
            </div>
            <div class="varGrid">
              ${vars.map(renderVariableCard).join("")}
            </div>
          </section>
        `;
    }).filter(Boolean);

    els.categorySections.innerHTML =
      blocks.join("") ||
      `<p style="color:rgba(255,255,255,.65);font-size:14px;">No hay variables que coincidan con la búsqueda.</p>`;

    els.categorySections.querySelectorAll(".varCard").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-copy-name") || "";
        const value = btn.getAttribute("data-copy-value") || "";
        copyText(`${name}: ${value}`);
      });
    });
  };

  const showDeploymentHints = (hints: unknown) => {
    const el = document.getElementById("deployment-hints");
    if (!el) return;
    const list = Array.isArray(hints) ? hints : [];
    if (list.length === 0) {
      el.textContent = "";
      el.classList.add("hidden");
      return;
    }
    el.textContent = list.join(" ");
    el.classList.remove("hidden");
  };

  const renderReport = (report: Record<string, unknown>) => {
    currentReport = report;
    const url = (report.url as string) || "";
    if (els.url) els.url.textContent = url;
    showDeploymentHints(report.hints);
    renderStats(report.stats as Record<string, number>);
    applyThemeToShowcase(report.theme as Record<string, unknown>);
    updateShowcaseSiteLink(url);
    renderBrandSections(report.theme as Record<string, unknown>);
    applyIdentityNote(report.theme as Record<string, unknown>);
    renderCategories(report, els.search?.value || "");
    show(els.loading, false);
    show(els.error, false);
    show(els.content, true);
  };

  const showError = (message: string) => {
    if (els.error) els.error.textContent = message;
    show(els.loading, false);
    show(els.content, false);
    show(els.error, true);
  };

  const loadReport = async () => {
    const params = new URLSearchParams(window.location.search);
    const rawUrl = params.get("url")?.trim() || "";
    if (rawUrl && !isRawUrlInputAllowed(rawUrl)) {
      showError("La URL de la barra de direcciones no es válida o no está permitida.");
      return;
    }
    const url = rawUrl ? ensureUrlProtocol(rawUrl) : "";

    if (!url) {
      showError("No se indicó ninguna URL. Vuelve al inicio e introduce un sitio para analizar.");
      return;
    }

    const cached = loadCachedReport(url);
    if (cached) {
      renderReport({ ...cached, url });
      return;
    }

    try {
      const data = await postAnalyze(url);
      const analyzedUrl = (data.url as string) || url;
      persistReportCache(analyzedUrl, data);
      renderReport(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      showError(`No se pudo cargar el estudio: ${msg}`);
    }
  };

  if (els.search) {
    els.search.addEventListener("input", () => {
      if (currentReport) renderCategories(currentReport, els.search?.value || "");
    });
  }

  loadReport();
}
