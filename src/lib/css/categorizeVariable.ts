import type { VariableCategory } from "../../types/analysis";
import { parseColorToHsl } from "../color/colorMath";

export function categorizeVariable(name: string, value: string): VariableCategory {
  const n = name.toLowerCase();
  const v = value.toLowerCase();

  if (
    parseColorToHsl(value) ||
    /^#([0-9a-f]{3,8})$/i.test(value.trim()) ||
    /^rgba?\(/.test(v) ||
    /^hsla?\(/.test(v) ||
    /(color|colour|bg|background|fill|stroke|accent|brand|primary|secondary|neutral|gray|grey|palette|tint|shade)/.test(
      n,
    )
  ) {
    return "color";
  }

  if (/(font|typography|line-height|letter-spacing|leading|tracking|text-size|fs-)/.test(n)) {
    return "typography";
  }

  if (/(shadow|elevation|drop-shadow)/.test(n) || /box-shadow/.test(v)) {
    return "shadow";
  }

  if (/(radius|rounded|corner)/.test(n) || /\d+(px|rem|em|%)\s*\/\s*\d+(px|rem|em|%)/.test(v)) {
    return "radius";
  }

  if (/(duration|ease|transition|animation|motion)/.test(n)) {
    return "animation";
  }

  if (/(space|spacing|gap|margin|padding|inset|size|width|height|grid|column|row|breakpoint|container)/.test(n)) {
    return "spacing";
  }

  if (/(z-index|layout|grid|flex|breakpoint|viewport|sidebar|header-height)/.test(n)) {
    return "layout";
  }

  if (/\d+(\.\d+)?(px|rem|em|%|ch|vw|vh)\b/.test(v) && /(size|space|gap|padding|margin)/.test(n)) {
    return "spacing";
  }

  return "other";
}
