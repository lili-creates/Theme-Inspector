export function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const raw = input.trim();
  if (!raw.startsWith("#")) return null;
  const hex = raw.slice(1);
  if (![3, 4, 6, 8].includes(hex.length)) return null;

  const expand = (h: string) => h + h;
  let rHex = "";
  let gHex = "";
  let bHex = "";

  if (hex.length === 3 || hex.length === 4) {
    rHex = expand(hex[0]!);
    gHex = expand(hex[1]!);
    bHex = expand(hex[2]!);
  } else {
    rHex = hex.slice(0, 2);
    gHex = hex.slice(2, 4);
    bHex = hex.slice(4, 6);
  }

  const r = Number.parseInt(rHex, 16);
  const g = Number.parseInt(gHex, 16);
  const b = Number.parseInt(bHex, 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

export function parseRgbColor(input: string): { r: number; g: number; b: number } | null {
  const raw = input.trim().toLowerCase();
  const m = raw.match(
    /^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(?:\s*,\s*([0-9.]+)\s*)?\)$/,
  );
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if ([r, g, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return { r, g, b };
}

export function rgbToHsl(rgb: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

export function parseColorToHsl(input: string): { h: number; s: number; l: number } | null {
  const hex = parseHexColor(input);
  if (hex) return rgbToHsl(hex);
  const rgb = parseRgbColor(input);
  if (rgb) return rgbToHsl(rgb);
  const hslMatch = input
    .trim()
    .toLowerCase()
    .match(/^hsla?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%/);
  if (hslMatch) {
    return {
      h: Number(hslMatch[1]),
      s: Number(hslMatch[2]),
      l: Number(hslMatch[3]),
    };
  }
  return null;
}
