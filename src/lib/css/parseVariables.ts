export function normalizeCssValue(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** All --custom-property declarations found anywhere in CSS */
export function extractAllCustomProperties(cssText: string): Map<string, string> {
  const variables = new Map<string, string>();
  const declRe = /(--[A-Za-z0-9_-]+)\s*:\s*([^;}{]+)\s*;/g;
  let declMatch: RegExpExecArray | null;
  while ((declMatch = declRe.exec(cssText)) !== null) {
    const name = declMatch[1]!.trim();
    const value = normalizeCssValue(declMatch[2]!);
    if (name && value) variables.set(name, value);
  }
  return variables;
}

export function countVariableUsage(cssText: string, varName: string): number {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const baseRe = new RegExp(`var\\(\\s*${escaped}\\s*\\)`, "g");
  return cssText.match(baseRe)?.length ?? 0;
}
