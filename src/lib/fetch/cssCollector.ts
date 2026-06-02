import * as cheerio from "cheerio";
import { THEME_INSPECTOR_USER_AGENT } from "../browser/userAgent";
import { extractAllCustomProperties } from "../css/parseVariables";
import {
  canUsePlaywright,
  fetchTimeoutMs,
  maxStylesheetFetches,
} from "../runtime/deployment";
import { isUrlAllowedForServerFetch } from "../urlSafety";
import { safeFetchText } from "./safeFetch";

const MAX_INLINE_STYLE_NODES = 400;
const MAX_CSS_BYTES = 2_000_000;

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  if (!isUrlAllowedForServerFetch(url)) {
    throw new Error("URL not allowed");
  }
  const timeoutMs = fetchTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await safeFetchText(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": THEME_INSPECTOR_USER_AGENT,
        accept: "*/*",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function inlineStyleRule(index: number, attr: string): string {
  return `/* inline-style */ .inline-${index} { ${attr} }`;
}

async function collectWithBrowser(targetUrl: string): Promise<{
  html: string;
  inlineCss: string[];
  cssHrefs: string[];
}> {
  if (!canUsePlaywright()) {
    throw new Error("Playwright no está habilitado en este entorno");
  }

  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error("No se pudo cargar Playwright");
  }

  let browser: Awaited<ReturnType<typeof playwright.chromium.launch>> | null = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      /not available|Executable doesn't exist|browserType\.launch/i.test(msg)
        ? "Instala Chromium para Playwright: npx playwright install chromium"
        : msg,
    );
  }

  try {
    const context = await browser.newContext({
      userAgent: THEME_INSPECTOR_USER_AGENT,
      locale: "es-ES",
    });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(1200);

    const html = await page.content();
    const domData = await page.evaluate((rulePrefix) => {
      const inlineCss: string[] = [];
      document.querySelectorAll("style").forEach((el) => {
        const content = el.textContent || "";
        if (content.trim()) inlineCss.push(content);
      });

      const cssHrefs: string[] = [];
      document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
        const href = (el as HTMLLinkElement).href;
        if (href) cssHrefs.push(href);
      });

      document.querySelectorAll("[style]").forEach((el, i) => {
        const attr = el.getAttribute("style");
        if (attr && attr.trim()) {
          inlineCss.push(`${rulePrefix} .inline-${i} { ${attr} }`);
        }
      });

      return { inlineCss, cssHrefs };
    }, "/* inline-style */");

    const safeHrefs = domData.cssHrefs.filter((href) => isUrlAllowedForServerFetch(href));

    const cssFromLinks = await Promise.all(
      safeHrefs.map(async (href) => {
        try {
          const res = await context.request.get(href, {
            timeout: 15_000,
            headers: { accept: "text/css,*/*;q=0.9" },
          });
          if (!res.ok()) return "";
          return await res.text();
        } catch {
          return "";
        }
      }),
    );

    return {
      html,
      inlineCss: [...domData.inlineCss, ...cssFromLinks.filter(Boolean)],
      cssHrefs: safeHrefs,
    };
  } finally {
    if (browser) await browser.close();
  }
}

export async function collectCssFromPage(targetUrl: string): Promise<{
  css: string;
  html: string;
  variables: Map<string, string>;
  stylesheetCount: number;
}> {
  let html = "";
  let inlineCss: string[] = [];
  let cssHrefs: string[] = [];

  try {
    html = await fetchText(targetUrl, {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/\(403\)/.test(msg)) throw err;
    if (!canUsePlaywright()) {
      throw new Error(
        "El sitio bloqueó la descarga directa (403). En producción usa PUBLIC_ANALYZE_API_URL con el servicio analyzer.",
      );
    }
    let browserCollected;
    try {
      browserCollected = await collectWithBrowser(targetUrl);
    } catch (browserErr) {
      const detail = browserErr instanceof Error ? browserErr.message : String(browserErr);
      throw new Error(`El sitio bloqueó la descarga directa (403) y el fallback con navegador falló: ${detail}`);
    }
    html = browserCollected.html;
    inlineCss = browserCollected.inlineCss;
    cssHrefs = browserCollected.cssHrefs;
  }

  const $ = cheerio.load(html);

  if (inlineCss.length === 0) {
    $("style").each((_i, el) => {
      const content = $(el).text();
      if (content && content.trim()) inlineCss.push(content);
    });
  }

  let inlineStyleCount = 0;
  $("[style]").each((_i, el) => {
    if (inlineStyleCount >= MAX_INLINE_STYLE_NODES) return;
    const attr = $(el).attr("style");
    if (attr && attr.trim()) {
      inlineCss.push(inlineStyleRule(inlineStyleCount, attr));
      inlineStyleCount += 1;
    }
  });

  if (cssHrefs.length === 0) {
    $('link[rel="stylesheet"]').each((_i, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      try {
        const absolute = new URL(href, targetUrl).toString();
        if (isUrlAllowedForServerFetch(absolute)) cssHrefs.push(absolute);
      } catch {
        // ignore invalid hrefs
      }
    });
  }

  const hrefLimit = maxStylesheetFetches();
  const limitedHrefs = cssHrefs.slice(0, hrefLimit);

  const externalCssTexts = await Promise.all(
    limitedHrefs.map(async (href) => {
      if (!isUrlAllowedForServerFetch(href)) return "";
      try {
        return await fetchText(href, { headers: { accept: "text/css,*/*;q=0.9" } });
      } catch {
        return "";
      }
    }),
  );

  let combinedCss = [...inlineCss, ...externalCssTexts.filter(Boolean)].join("\n\n");
  if (combinedCss.length > MAX_CSS_BYTES) {
    combinedCss = combinedCss.slice(0, MAX_CSS_BYTES);
  }

  const variables = extractAllCustomProperties(combinedCss);

  return {
    css: combinedCss,
    html,
    variables,
    stylesheetCount: limitedHrefs.length + (inlineCss.length > 0 ? 1 : 0),
  };
}
