export type ShowcaseSwatchDef = {
  label: string;
  role: string;
  cssVar: string;
  /** Clave en dataset del showcase (`data-has-primary`, etc.). */
  presenceKey: string;
  variant: "hero" | "surface" | "text";
};

export const HERO_SWATCHES: ShowcaseSwatchDef[] = [
  {
    role: "Primario",
    label: "Color de marca principal",
    cssVar: "--extracted-primary",
    presenceKey: "hasPrimary",
    variant: "hero",
  },
  {
    role: "Secundario",
    label: "Acento o soporte",
    cssVar: "--extracted-secondary",
    presenceKey: "hasSecondary",
    variant: "hero",
  },
];

export const SURFACE_SWATCHES: ShowcaseSwatchDef[] = [
  {
    role: "Fondo",
    label: "Superficie base de la UI",
    cssVar: "--extracted-bg",
    presenceKey: "hasBg",
    variant: "surface",
  },
];

export const TEXT_SWATCHES: ShowcaseSwatchDef[] = [
  {
    role: "Cuerpo",
    label: "Texto sobre fondos",
    cssVar: "--extracted-text-surface",
    presenceKey: "hasTextSurface",
    variant: "text",
  },
  {
    role: "Interactivo",
    label: "Texto en botones y CTAs",
    cssVar: "--extracted-text-button",
    presenceKey: "hasTextButton",
    variant: "text",
  },
];
