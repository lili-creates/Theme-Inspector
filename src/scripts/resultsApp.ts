import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  ROLE_LABELS,
  UI_SEMANTIC_HINT_LABELS,
} from "../lib/constants";
import { postAnalyze } from "../lib/client/analyzeClient";
import {
  loadCachedReport,
  loadPreviewCache,
  persistReportCache,
  savePreviewCache,
} from "../lib/client/sessionCache";
import { ensureUrlProtocol } from "../lib/url";
import { renderBrandCard, renderDeclaredBrandToken } from "./renderers/brandCards";

export function initResultsPage(): void {
  let previewRequestSeq = 0;

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
      search: document.getElementById("var-search"),
      showcase: document.getElementById("theme-showcase"),
    };

    let currentReport = null;

    const show = (el, visible) => {
      if (!el) return;
      el.classList.toggle("hidden", !visible);
    };

    const formatBytes = (n) => {
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    };

  const applyThemeToShowcase = (theme) => {
      if (!els.showcase) return;
      const primary = theme?.primary_color || "";
      const secondary = theme?.secondary_color || "";
      const bg = Array.isArray(theme?.backgrounds) ? theme.backgrounds[0] || "" : "";
      const textSurface = theme?.text_on_background || theme?.text_color || "";
      const textButton = theme?.text_on_button || textSurface || "";

      const styleParts = [];
      if (primary) styleParts.push(`--extracted-primary: ${primary};`);
      if (secondary) styleParts.push(`--extracted-secondary: ${secondary};`);
      if (bg) styleParts.push(`--extracted-bg: ${bg};`);
      if (textSurface) styleParts.push(`--extracted-text-surface: ${textSurface};`);
      if (textButton) styleParts.push(`--extracted-text-button: ${textButton};`);
      if (textSurface) styleParts.push(`--extracted-text: ${textSurface};`);
      els.showcase.setAttribute("style", styleParts.join(" "));

      const map = {
        "--extracted-primary": primary || "N/A",
        "--extracted-secondary": secondary || "N/A",
        "--extracted-bg": bg || "N/A",
        "--extracted-text-surface": textSurface || "N/A",
        "--extracted-text-button": textButton || "N/A",
        "--extracted-text": textSurface || "N/A",
      };
      els.showcase.querySelectorAll("[data-value]").forEach((node) => {
        const key = node.getAttribute("data-value");
        if (key && key in map) node.textContent = map[key];
      });

      const ranked = document.getElementById("palette-ranked");
      const visiblePalette = Array.isArray(theme?.brandVisible)
        ? theme.brandVisible
        : theme?.palette || [];
      if (ranked && visiblePalette.length > 0) {
        ranked.innerHTML = visiblePalette
          .map((c) => {
            const roleLabel = ROLE_LABELS[c.role] || "Color";
            const isPrimary = c.role === "primary";
            const vis =
              typeof c.visibleWeight === "number" ? ` · ${c.visibleWeight}% visible` : "";
            return `
              <button class="rankSwatch${isPrimary ? " isPrimary" : ""}" type="button" data-hex="${c.hex}" style="--card-color:${c.hex}">
                <span class="chipArea"><span class="chip"></span>${isPrimary ? `<span class="roleBadge">${roleLabel}</span>` : ""}</span>
                <span class="cardInfo">
                  <span class="hex">${c.hex}</span>
                  <span class="meta">${roleLabel}${vis} · ${c.usage} usos CSS</span>
                </span>
              </button>
            `;
          })
          .join("");

        ranked.querySelectorAll("[data-hex]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const hex = btn.getAttribute("data-hex");
            if (hex) copyText(hex);
          });
        });
      }
    };

  const hydrateCachedPreview = (report) => {
      if (report?.previewScreenshot) return report;
      const shot = loadPreviewCache(report?.url || "");
      if (!shot) return report;
      return { ...report, previewScreenshot: shot };
    };

    const fetchPreviewScreenshot = async (url) => {
      const res = await fetch("/api/site-screenshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status}`);
      }
      return data?.previewScreenshot || "";
    };

    const setupSitePreview = async (report) => {
      const requestSeq = ++previewRequestSeq;
      const url = report?.url || "";
      const frame = document.getElementById("site-preview-frame");
      const shot = document.getElementById("site-preview-shot");
      const empty = document.getElementById("site-preview-empty");
      const loading = document.getElementById("site-preview-loading");
      const note = document.getElementById("site-preview-note");
      const host = document.getElementById("preview-site-host");
      const openTab = document.getElementById("preview-open-tab");
      const liveToggle = document.getElementById("preview-live-toggle");

      const setHidden = (el, hidden) => {
        if (el) el.classList.toggle("hidden", hidden);
      };

      if (host) {
        if (url) {
          try {
            host.textContent = new URL(url).hostname;
          } catch {
            host.textContent = url;
          }
        } else {
          host.textContent = "—";
        }
      }

      if (openTab) {
        if (url) {
          openTab.href = url;
          setHidden(openTab, false);
        } else {
          setHidden(openTab, true);
        }
      }

      setHidden(empty, Boolean(url));
      setHidden(liveToggle, true);
      if (liveToggle) liveToggle.classList.remove("isActive");
      if (frame) {
        frame.classList.remove("isLive");
        frame.removeAttribute("src");
        setHidden(frame, true);
      }
      if (shot) {
        shot.removeAttribute("src");
        setHidden(shot, true);
      }
      setHidden(loading, true);
      setHidden(note, true);

      if (!url) return;

      let screenshot = report?.previewScreenshot || loadPreviewCache(url) || "";

      const applyScreenshot = (base64) => {
        if (!shot || !base64) return false;
        shot.src = `data:image/jpeg;base64,${base64}`;
        setHidden(shot, false);
        if (frame) {
          frame.src = url;
          setHidden(frame, false);
        }
        if (liveToggle) setHidden(liveToggle, false);
        setHidden(note, false);
        return true;
      };

      const showIframeOnly = () => {
        if (frame) {
          frame.src = url;
          frame.classList.add("isLive");
          setHidden(frame, false);
        }
        setHidden(shot, true);
        if (liveToggle) {
          setHidden(liveToggle, false);
          liveToggle.classList.add("isActive");
        }
        setHidden(note, false);
      };

      if (applyScreenshot(screenshot)) {
        if (!liveToggle?._bound) {
          liveToggle._bound = true;
          liveToggle.addEventListener("click", () => {
            const isLive = frame?.classList.toggle("isLive");
            liveToggle.classList.toggle("isActive", Boolean(isLive));
            liveToggle.textContent = isLive ? "Ver captura" : "Vista en vivo";
          });
        }
        return;
      }

      setHidden(loading, false);
      try {
        screenshot = await fetchPreviewScreenshot(url);
        if (requestSeq !== previewRequestSeq) return;
        if (screenshot) {
          report.previewScreenshot = screenshot;
          savePreviewCache(url, screenshot);
        }
      } catch {
        screenshot = "";
      } finally {
        if (requestSeq === previewRequestSeq) setHidden(loading, true);
      }

      if (requestSeq !== previewRequestSeq) return;

      if (applyScreenshot(screenshot)) {
        if (!liveToggle?._bound) {
          liveToggle._bound = true;
          liveToggle.addEventListener("click", () => {
            const isLive = frame?.classList.toggle("isLive");
            liveToggle.classList.toggle("isActive", Boolean(isLive));
            liveToggle.textContent = isLive ? "Ver captura" : "Vista en vivo";
          });
        }
        return;
      }

      showIframeOnly();
    };

    const renderStats = (stats) => {
      if (!els.statsGrid) return;
      const items = [
        { label: "Reglas CSS", value: stats.rules },
        { label: "Selectores", value: stats.selectors },
        { label: "Declaraciones", value: stats.declarations },
        { label: "Variables (--*)", value: stats.customPropertyDeclarations },
        { label: "Usos de var()", value: stats.varReferences },
        { label: "Hojas de estilo", value: stats.stylesheets },
        { label: "Tamaño CSS", value: formatBytes(stats.cssSizeBytes) },
        { label: "Tokens únicos", value: currentReport?.variables?.length ?? 0 },
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

    const copyText = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // ignore
      }
    };

  const renderBrandSections = (theme) => {
      const tokens = Array.isArray(theme?.brandTokens) ? theme.brandTokens : [];
      const visible = Array.isArray(theme?.brandVisible) ? theme.brandVisible : [];
      const legacy = Array.isArray(theme?.brandLegacy) ? theme.brandLegacy : [];

      if (els.brandTokensGrid) {
        els.brandTokensGrid.innerHTML =
          tokens.length > 0
            ? tokens.map(renderDeclaredBrandToken).join("")
            : `<p style="color:rgba(255,255,255,.65);font-size:13px;">No se encontraron variables CSS con nombre de marca.</p>`;
      }

      if (els.brandVisibleGrid) {
        els.brandVisibleGrid.innerHTML =
          visible.length > 0
            ? visible.map(renderBrandCard).join("")
            : `<p style="color:rgba(255,255,255,.65);font-size:13px;">No se detectaron colores cromÃ¡ticos visibles en el viewport.</p>`;
      }

      if (els.brandLegacyGrid) {
        els.brandLegacyGrid.innerHTML =
          legacy.length > 0
            ? legacy.map(renderBrandCard).join("")
            : `<p style="color:rgba(255,255,255,.65);font-size:13px;">No hay colores legacy relevantes fuera de la UI visible.</p>`;
      }

      document.querySelectorAll(".brandCard").forEach((btn) => {
        btn.addEventListener("click", () => {
          const hex = btn.getAttribute("data-hex");
          if (hex) copyText(hex);
        });
      });
    };

    const applyIdentityNote = (theme) => {
      const primary = theme?.primary_color;
      const tokenPrimary = (theme?.brandTokens || []).find((t) => t.roleHint === "primary");
      if (!primary || !tokenPrimary || tokenPrimary.hex.toUpperCase() === primary.toUpperCase()) {
        return;
      }
      const note = document.getElementById("identity-note");
      if (!note) return;
      note.textContent = `Primario en pantalla: ${primary}. En tokens CSS también existe ${tokenPrimary.name} (${tokenPrimary.hex})${tokenPrimary.semanticHint ? ` — ${UI_SEMANTIC_HINT_LABELS[tokenPrimary.semanticHint]}` : ""}.`;
      note.classList.remove("hidden");
    };

    const renderVariableCard = (v) => {
      const swatchClass = v.isColor ? "swatch" : "swatch isToken";
      const cardClass = v.isColor ? "varCard isColor" : "varCard";
      const swatchStyle = v.isColor ? `--swatch-color:${v.value}` : "";
      return `
        <button class="${cardClass}" type="button" style="${swatchStyle}" data-copy-name="${v.name}" data-copy-value="${v.value.replace(/"/g, "&quot;")}" title="Clic para copiar">
          <span class="${swatchClass}"></span>
          <span class="varBody">
            <span class="name">${v.name}</span>
            <span class="value">${v.value}</span>
            <span class="usage">${v.usage} usos en CSS</span>
          </span>
        </button>
      `;
    };

    const renderCategories = (report, filter = "") => {
      if (!els.categorySections) return;
      const q = filter.trim().toLowerCase();

      const blocks = CATEGORY_ORDER.map((cat) => {
        const vars = (report.variablesByCategory?.[cat] || []).filter((v) => {
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
        blocks.join("") || `<p style="color:rgba(255,255,255,.65);font-size:14px;">No hay variables que coincidan con la bÃºsqueda.</p>`;

      els.categorySections.querySelectorAll(".varCard").forEach((btn) => {
        btn.addEventListener("click", () => {
          const name = btn.getAttribute("data-copy-name") || "";
          const value = btn.getAttribute("data-copy-value") || "";
          copyText(`${name}: ${value}`);
        });
      });
    };

    const renderReport = async (report) => {
      currentReport = report;
      if (els.url) els.url.textContent = report.url;
      renderStats(report.stats);
      applyThemeToShowcase(report.theme);
      await setupSitePreview(report);
      renderBrandSections(report.theme);
      applyIdentityNote(report.theme);
      renderCategories(report, els.search?.value || "");
      show(els.loading, false);
      show(els.error, false);
      show(els.content, true);
    };

    const showError = (message) => {
      if (els.error) els.error.textContent = message;
      show(els.loading, false);
      show(els.content, false);
      show(els.error, true);
    };

  const loadReport = async () => {
    const params = new URLSearchParams(window.location.search);
    const rawUrl = params.get("url")?.trim() || "";
    const url = rawUrl ? ensureUrlProtocol(rawUrl) : "";

    if (!url) {
      showError("No se indicó ninguna URL. Vuelve al inicio e introduce un sitio para analizar.");
      return;
    }

    const cached = loadCachedReport(url);
    if (cached) {
      renderReport(hydrateCachedPreview({ ...cached, url }));
      return;
    }

    savePreviewCache(url, "");

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
      if (currentReport) renderCategories(currentReport, els.search.value);
    });
  }

  loadReport();
}
