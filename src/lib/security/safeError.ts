export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Avoid leaking paths/stack traces in public API responses. */
export function publicErrorDetails(err: unknown, isFetchError: boolean): string {
  if (!isProduction()) {
    return err instanceof Error ? err.message : String(err);
  }
  if (isFetchError) {
    return "No se pudo acceder al sitio. Comprueba que la URL sea pública.";
  }
  return "Error interno al analizar el sitio.";
}
