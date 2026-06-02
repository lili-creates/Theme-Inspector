import * as cheerio from "cheerio";
import { THEME_INSPECTOR_USER_AGENT } from "../browser/userAgent";
import { extractAllCustomProperties } from "../css/parseVariables";

const MAX_INLINE_STYLE_NODES = 400;
const MAX_CSS_BYTES = 2_000_000;

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": THEME_INSPECTOR_USER_AGENT,
        accept: "*/*",
        ...(init?.headers ?? {}),
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return await res.text();
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
  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
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

    const cssFromLinks = await Promise.all(
      domData.cssHrefs.map(async (href) => {
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
      cssHrefs: domData.cssHrefs,
    };
  } finally {
    await browser.close();
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
    const browserCollected = await collectWithBrowser(targetUrl);
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
        cssHrefs.push(new URL(href, targetUrl).toString());
      } catch {
        // ignore invalid hrefs
      }
    });
  }

  const externalCssTexts = await Promise.all(
    cssHrefs.map(async (href) => {
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
    stylesheetCount: cssHrefs.length + (inlineCss.length > 0 ? 1 : 0),
  };
}
