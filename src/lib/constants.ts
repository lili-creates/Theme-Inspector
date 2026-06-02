export const STORAGE_KEY = "ti:lastAnalysis";
export const STORAGE_PREVIEW_KEY = "ti:lastPreviewShot";

export const CATEGORY_LABELS: Record<string, string> = {
  color: "Colores",
  spacing: "Espaciado y tamaño",
  typography: "Tipografía",
  radius: "Radios y bordes",
  shadow: "Sombras",
  animation: "Animación",
  layout: "Layout",
  other: "Otros tokens",
};

export const CATEGORY_ORDER = [
  "color",
  "typography",
  "spacing",
  "radius",
  "shadow",
  "animation",
  "layout",
  "other",
] as const;

export const ROLE_LABELS: Record<string, string> = {
  primary: "Primario",
  secondary: "Secundario",
  accent: "Acento",
  background: "Fondo",
  text: "Texto (fondo)",
  "text-surface": "Texto (fondo)",
  "text-button": "Texto (botón)",
  palette: "Paleta",
};

/** Labels for declared brand tokens in the results UI (shorter copy than brandTokens.ts). */
export const UI_SEMANTIC_HINT_LABELS: Record<string, string> = {
  error: "semántico (error)",
  success: "semántico (éxito)",
  warning: "semántico (aviso)",
  info: "semántico (info)",
};
