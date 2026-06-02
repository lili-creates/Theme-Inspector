type ExtractedTheme = {
  primary_color?: string;
  secondary_color?: string;
  backgrounds?: string[];
  text_on_background?: string;
  text_color?: string;
  text_on_button?: string;
  viewportSampled?: boolean;
};

const EXTRACTED_VARS = [
  "--extracted-primary",
  "--extracted-secondary",
  "--extracted-bg",
  "--extracted-text-surface",
  "--extracted-text-button",
  "--extracted-text",
] as const;

const UNSET_LABEL = "No detectado en pantalla";

export function updateShowcaseSiteLink(url: string): void {
  const link = document.getElementById("showcase-site-link");
  if (!(link instanceof HTMLAnchorElement)) return;
  if (!url) {
    link.classList.add("hidden");
    return;
  }
  link.href = url;
  link.classList.remove("hidden");
}

export function applyThemeToShowcase(theme: ExtractedTheme | null | undefined): void {
  const showcase = document.getElementById("theme-showcase");
  if (!showcase) return;

  const primary = theme?.primary_color?.trim() || "";
  const secondary = theme?.secondary_color?.trim() || "";
  const bg = Array.isArray(theme?.backgrounds) ? theme.backgrounds[0]?.trim() || "" : "";
  const textSurface = theme?.text_on_background?.trim() || theme?.text_color?.trim() || "";
  const textButton = theme?.text_on_button?.trim() || "";

  for (const name of EXTRACTED_VARS) {
    showcase.style.removeProperty(name);
  }

  const setVar = (name: string, value: string) => {
    if (value) showcase.style.setProperty(name, value);
  };

  setVar("--extracted-primary", primary);
  setVar("--extracted-secondary", secondary);
  setVar("--extracted-bg", bg);
  setVar("--extracted-text-surface", textSurface);
  setVar("--extracted-text-button", textButton || textSurface);
  if (textSurface) setVar("--extracted-text", textSurface);

  showcase.dataset.hasPrimary = primary ? "true" : "false";
  showcase.dataset.hasSecondary = secondary ? "true" : "false";
  showcase.dataset.hasBg = bg ? "true" : "false";
  showcase.dataset.hasTextSurface = textSurface ? "true" : "false";
  showcase.dataset.hasTextButton = textButton ? "true" : "false";
  showcase.dataset.viewportSampled = theme?.viewportSampled ? "true" : "false";

  const map: Record<string, string> = {
    "--extracted-primary": primary,
    "--extracted-secondary": secondary,
    "--extracted-bg": bg,
    "--extracted-text-surface": textSurface,
    "--extracted-text-button": textButton || textSurface,
    "--extracted-text": textSurface,
  };

  showcase.querySelectorAll("[data-value]").forEach((node) => {
    const key = node.getAttribute("data-value");
    const value = key && key in map ? map[key] : "";
    const btn = node.closest("[data-presence]");
    const presence = btn?.getAttribute("data-presence");
    const hasRole =
      presence === "hasPrimary"
        ? Boolean(primary)
        : presence === "hasSecondary"
          ? Boolean(secondary)
          : presence === "hasBg"
            ? Boolean(bg)
            : presence === "hasTextSurface"
              ? Boolean(textSurface)
              : presence === "hasTextButton"
                ? Boolean(textButton)
                : Boolean(value);

    if (!hasRole || !value) {
      node.textContent = "—";
      const label = btn?.querySelector(".swatchLabel");
      if (label && presence) {
        label.textContent = UNSET_LABEL;
      }
      return;
    }

    node.textContent = value;
    const label = btn?.querySelector(".swatchLabel");
    if (label) {
      const defaults: Record<string, string> = {
        hasPrimary: "Color de marca principal",
        hasSecondary: "Acento o soporte",
        hasBg: "Superficie base de la UI",
        hasTextSurface: "Texto sobre fondos",
        hasTextButton: "Texto en botones y CTAs",
      };
      if (presence && defaults[presence]) label.textContent = defaults[presence];
    }
  });
}
