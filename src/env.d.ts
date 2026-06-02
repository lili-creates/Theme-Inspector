/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** URL del servicio analyzer (Render/Railway). Vacío = mismo origen en local. */
  readonly PUBLIC_ANALYZE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
