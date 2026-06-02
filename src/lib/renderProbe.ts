export type RenderedColorSignal = {
  colors: Record<string, number>;
  textColors: Record<string, number>;
  /** Texto de párrafos/menús en gris o neutro (excluye enlaces de marca en verde lima, etc.) */
  bodyTextColors: Record<string, number>;
  buttonTextColors: Record<string, number>;
  backgroundColors: Record<string, number>;
  /** JPEG en base64 (sin prefijo data:) */
  screenshotBase64?: string;
};

function normalizeHex(input: string): string | null {
  const raw = input.trim().toUpperCase();
  const m = raw.match(/^#([0-9A-F]{3}|[0-9A-F]{6})$/);
  if (!m) return null;
  const hex = m[1]!;
  if (hex.length === 6) return `#${hex}`;
  return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
}

async function safeCloseBrowser(browser: unknown): Promise<void> {
  if (!browser || typeof browser !== "object") return;
  const b = browser as { close?: () => Promise<void> };
  if (typeof b.close !== "function") return;
  try {
    await b.close();
  } catch {
    // ignore close errors
  }
}

import { THEME_INSPECTOR_USER_AGENT } from "./browser/userAgent";

// Optional runtime probe using Playwright. If unavailable, returns null.
async function probeRenderedColors(url: string): Promise<RenderedColorSignal | null> {
  let playwright: typeof import("playwright") | null = null;
  try {
    playwright = await import("playwright");
  } catch {
    return null;
  }

  let browser: Awaited<ReturnType<typeof playwright.chromium.launch>> | null = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: THEME_INSPECTOR_USER_AGENT });
    const page = await context.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
    await page.waitForTimeout(1200);

    const screenshotBuffer = await page.screenshot({
      type: "jpeg",
      quality: 76,
      fullPage: false,
    });

    const result = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("*")).slice(0, 2500);
      const all: Record<string, number> = {};
      const text: Record<string, number> = {};
      const bodyText: Record<string, number> = {};
      const buttonText: Record<string, number> = {};
      const background: Record<string, number> = {};

      const rgbChroma = (r: number, g: number, b: number) => {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max <= 0) return 0;
        return (max - min) / max;
      };

      const parseRgb = (raw: string) => {
        const m = raw.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (!m) return null;
        return {
          r: Math.max(0, Math.min(255, Number(m[1]))),
          g: Math.max(0, Math.min(255, Number(m[2]))),
          b: Math.max(0, Math.min(255, Number(m[3]))),
        };
      };

      const add = (target: Record<string, number>, raw: string, weight: number) => {
        const rgb = parseRgb(raw);
        if (!rgb) return;
        const hex =
          "#" +
          rgb.r.toString(16).padStart(2, "0") +
          rgb.g.toString(16).padStart(2, "0") +
          rgb.b.toString(16).padStart(2, "0");
        target[hex] = (target[hex] ?? 0) + weight;
        all[hex] = (all[hex] ?? 0) + weight;
        return { hex, ...rgb };
      };

      const isBodyCopyColor = (r: number, g: number, b: number) => {
        const chroma = rgbChroma(r, g, b);
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (luma >= 0.92) return false;
        if (luma <= 0.08) return false;
        return chroma < 0.2;
      };

      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth;
        if (!visible) continue;

        const areaWeight = Math.max(1, Math.min(10, (rect.width * rect.height) / 6000));
        const cs = window.getComputedStyle(el);
        const tag = el.tagName.toLowerCase();
        const hasText = (el.textContent || "").trim().length > 0;
        const isButton =
          tag === "button" ||
          (tag === "input" && /^(submit|button)$/i.test((el as HTMLInputElement).type || "")) ||
          el.getAttribute("role") === "button";
        const isTypographic =
          /^(p|h[1-6]|a|span|li|td|th|label|strong|em|small|figcaption|div)$/.test(tag);
        const isNavItem = tag === "a" || tag === "span" || tag === "li";

        add(background, cs.backgroundColor, areaWeight * 1.4);
        if (isButton) {
          add(buttonText, cs.color, areaWeight * 3.2);
        } else if (hasText || isTypographic) {
          const parsed = add(text, cs.color, areaWeight * 2.4);
          if (parsed && isBodyCopyColor(parsed.r, parsed.g, parsed.b)) {
            const bodyWeight = isNavItem && rgbChroma(parsed.r, parsed.g, parsed.b) > 0.08 ? areaWeight * 2.2 : areaWeight * 3.4;
            bodyText[parsed.hex] = (bodyText[parsed.hex] ?? 0) + bodyWeight;
          }
        } else {
          add(text, cs.color, areaWeight * 0.6);
        }
        add(all, cs.borderColor, areaWeight * 0.7);
      }
      return { all, text, bodyText, buttonText, background };
    });

    const normalizeMap = (input: Record<string, number>) => {
      const normalized: Record<string, number> = {};
      for (const [k, v] of Object.entries(input)) {
        const hex = normalizeHex(k);
        if (!hex) continue;
        normalized[hex] = (normalized[hex] ?? 0) + v;
      }
      return normalized;
    };

    const payload = result as {
      all: Record<string, number>;
      text: Record<string, number>;
      bodyText: Record<string, number>;
      buttonText: Record<string, number>;
      background: Record<string, number>;
    };

    const bodyTextColors = normalizeMap(payload.bodyText);
    const textColors = normalizeMap(payload.text);

    return {
      colors: normalizeMap(payload.all),
      textColors,
      bodyTextColors: Object.keys(bodyTextColors).length > 0 ? bodyTextColors : textColors,
      buttonTextColors: normalizeMap(payload.buttonText),
      backgroundColors: normalizeMap(payload.background),
      screenshotBase64: screenshotBuffer.toString("base64"),
    };
  } catch {
    return null;
  } finally {
    await safeCloseBrowser(browser);
  }
}

export async function probeRenderedColorsWithTimeout(
  url: string,
  timeoutMs = 10_000,
): Promise<RenderedColorSignal | null> {
  try {
    return await Promise.race([
      probeRenderedColors(url),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  }
}
