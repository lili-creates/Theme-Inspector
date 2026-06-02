const THEME_INSPECTOR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ThemeInspector/0.0.1";

function isVercelServerless() {
  return process.env.VERCEL === "1";
}
function canUsePlaywright() {
  if (process.env.DISABLE_PLAYWRIGHT === "true") return false;
  if (process.env.PLAYWRIGHT_ENABLED === "true") return true;
  if (isVercelServerless()) return false;
  if (process.env.ENABLE_PLAYWRIGHT === "false") return false;
  return true;
}
function fetchTimeoutMs() {
  return isVercelServerless() ? 6e3 : 2e4;
}
function maxStylesheetFetches() {
  return isVercelServerless() ? 12 : 40;
}
function analyzeProbeTimeoutMs() {
  if (!canUsePlaywright()) return 0;
  return 25e3;
}
function screenshotProbeTimeoutMs() {
  if (!canUsePlaywright()) return 0;
  return 25e3;
}

function normalizeHex(input) {
  const raw = input.trim().toUpperCase();
  const m = raw.match(/^#([0-9A-F]{3}|[0-9A-F]{6})$/);
  if (!m) return null;
  const hex = m[1];
  if (hex.length === 6) return `#${hex}`;
  return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
}
async function safeCloseBrowser(browser) {
  if (!browser || typeof browser !== "object") return;
  const b = browser;
  if (typeof b.close !== "function") return;
  try {
    await b.close();
  } catch {
  }
}
async function probeRenderedColors(url) {
  let playwright = null;
  try {
    playwright = await import('./playwright_CczXddnS.mjs');
  } catch {
    return null;
  }
  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: THEME_INSPECTOR_USER_AGENT });
    const page = await context.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12e3 });
    await page.waitForTimeout(1200);
    const screenshotBuffer = await page.screenshot({
      type: "jpeg",
      quality: 76,
      fullPage: false
    });
    const result = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("*")).slice(0, 2500);
      const all = {};
      const text = {};
      const bodyText = {};
      const buttonText = {};
      const background = {};
      const rgbChroma = (r, g, b) => {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max <= 0) return 0;
        return (max - min) / max;
      };
      const parseRgb = (raw) => {
        const m = raw.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (!m) return null;
        return {
          r: Math.max(0, Math.min(255, Number(m[1]))),
          g: Math.max(0, Math.min(255, Number(m[2]))),
          b: Math.max(0, Math.min(255, Number(m[3])))
        };
      };
      const add = (target, raw, weight) => {
        const rgb = parseRgb(raw);
        if (!rgb) return;
        const hex = "#" + rgb.r.toString(16).padStart(2, "0") + rgb.g.toString(16).padStart(2, "0") + rgb.b.toString(16).padStart(2, "0");
        target[hex] = (target[hex] ?? 0) + weight;
        all[hex] = (all[hex] ?? 0) + weight;
        return { hex, ...rgb };
      };
      const isBodyCopyColor = (r, g, b) => {
        const chroma = rgbChroma(r, g, b);
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (luma >= 0.92) return false;
        if (luma <= 0.08) return false;
        return chroma < 0.2;
      };
      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
        if (!visible) continue;
        const areaWeight = Math.max(1, Math.min(10, rect.width * rect.height / 6e3));
        const cs = window.getComputedStyle(el);
        const tag = el.tagName.toLowerCase();
        const hasText = (el.textContent || "").trim().length > 0;
        const isButton = tag === "button" || tag === "input" && /^(submit|button)$/i.test(el.type || "") || el.getAttribute("role") === "button";
        const isTypographic = /^(p|h[1-6]|a|span|li|td|th|label|strong|em|small|figcaption|div)$/.test(tag);
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
    const normalizeMap = (input) => {
      const normalized = {};
      for (const [k, v] of Object.entries(input)) {
        const hex = normalizeHex(k);
        if (!hex) continue;
        normalized[hex] = (normalized[hex] ?? 0) + v;
      }
      return normalized;
    };
    const payload = result;
    const bodyTextColors = normalizeMap(payload.bodyText);
    const textColors = normalizeMap(payload.text);
    return {
      colors: normalizeMap(payload.all),
      textColors,
      bodyTextColors: Object.keys(bodyTextColors).length > 0 ? bodyTextColors : textColors,
      buttonTextColors: normalizeMap(payload.buttonText),
      backgroundColors: normalizeMap(payload.background),
      screenshotBase64: screenshotBuffer.toString("base64")
    };
  } catch {
    return null;
  } finally {
    await safeCloseBrowser(browser);
  }
}
async function probeRenderedColorsWithTimeout(url, timeoutMs = 1e4) {
  if (!canUsePlaywright() || timeoutMs <= 0) return null;
  try {
    return await Promise.race([
      probeRenderedColors(url),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
  } catch {
    return null;
  }
}

function normalizeTargetUrl(input) {
  const raw = input.trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProtocol);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function isPrivateIpv4(host) {
  const parts = host.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}
function isUrlAllowedForServerFetch(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "0.0.0.0" || host === "[::1]" || host === "::1") {
    return false;
  }
  if (isPrivateIpv4(host)) return false;
  if (host === "169.254.169.254") return false;
  return true;
}

export { THEME_INSPECTOR_USER_AGENT as T, analyzeProbeTimeoutMs as a, isVercelServerless as b, canUsePlaywright as c, fetchTimeoutMs as f, isUrlAllowedForServerFetch as i, maxStylesheetFetches as m, normalizeTargetUrl as n, probeRenderedColorsWithTimeout as p, screenshotProbeTimeoutMs as s };
