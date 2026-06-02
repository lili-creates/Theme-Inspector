export type VariableCategory =
  | "color"
  | "spacing"
  | "typography"
  | "radius"
  | "shadow"
  | "animation"
  | "layout"
  | "other";

export type CssVariable = {
  name: string;
  value: string;
  category: VariableCategory;
  usage: number;
  isColor: boolean;
  hsl: { h: number; s: number; l: number } | null;
};

export type ColorSource = "visible" | "legacy";

/** Token de color declarado en el design system (p. ej. --maui-color-brand-lhdeepblue). */
export type DeclaredBrandToken = {
  name: string;
  hex: string;
  hsl: { h: number; s: number; l: number };
  usage: number;
  /** Si el nombre sugiere error/éxito/aviso — informativo, no excluye si domina en pantalla. */
  semanticHint: "error" | "success" | "warning" | "info" | null;
  roleHint: "primary" | "secondary" | null;
  visibleWeight: number;
  usedOnScreen: boolean;
};

export type PaletteColor = {
  hex: string;
  usage: number;
  score: number;
  role:
    | "primary"
    | "secondary"
    | "accent"
    | "background"
    | "text"
    | "text-surface"
    | "text-button"
    | "palette"
    | null;
  hsl: { h: number; s: number; l: number };
  /** visible = detectado en viewport; legacy = solo en CSS/tokens */
  source: ColorSource;
  /** Peso relativo de presencia visual (0-100) */
  visibleWeight: number;
};

export type ThemeResult = {
  primary_color: string | null;
  secondary_color: string | null;
  backgrounds: string[];
  /** Texto sobre fondos / superficies (body, cards, nav links). */
  text_on_background: string | null;
  /** Texto sobre botones y CTAs (suele contrastar con el fill). */
  text_on_button: string | null;
  /** Alias de text_on_background (compatibilidad). */
  text_color: string | null;
  /** true si Playwright aportó pesos de color del viewport. */
  viewportSampled: boolean;
  /** Tokens CSS que declaran colores de marca (todos, con contexto). */
  brandTokens: DeclaredBrandToken[];
  /** Colores de marca visibles en la UI (prioridad jerárquica) */
  brandVisible: PaletteColor[];
  /** Colores definidos en CSS pero no prevalentes en pantalla */
  brandLegacy: PaletteColor[];
  /** Vista combinada (compatibilidad) */
  palette: PaletteColor[];
};

export type CssStats = {
  rules: number;
  selectors: number;
  declarations: number;
  customPropertyDeclarations: number;
  varReferences: number;
  stylesheets: number;
  cssSizeBytes: number;
};

export type AnalysisReport = {
  url: string;
  analyzedAt: string;
  stats: CssStats;
  theme: ThemeResult;
  variables: CssVariable[];
  variablesByCategory: Record<VariableCategory, CssVariable[]>;
};
