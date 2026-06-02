# Theme Inspector

Analiza colores, variables CSS y tokens de marca de sitios públicos. La **web** puede ir en **Vercel (gratis)** y el **análisis con Playwright** en **Render (gratis)**.

## Arquitectura

```text
Navegador → Vercel (Astro, UI)
              ↓ POST /api/analyze
         Render/Railway (Node + Playwright)
```

El navegador llama directamente al analyzer (`PUBLIC_ANALYZE_API_URL`) para evitar el límite de **10 s** de las funciones en Vercel Hobby.

## 1. Desplegar el analyzer (Playwright) — Render gratis

1. Crea cuenta en [render.com](https://render.com).
2. **New → Blueprint** (o Web Service) y conecta este repositorio.
3. Usa el archivo `render.yaml` (Docker + imagen Playwright).
4. Cuando esté en marcha, copia la URL pública, p. ej. `https://theme-inspector-analyzer.onrender.com`.
5. En **Environment** del servicio, opcional:
   - `ALLOWED_ORIGINS` = `https://tu-proyecto.vercel.app` (varias URLs separadas por coma).

Comprueba: `GET https://tu-analyzer.onrender.com/health` → `{"ok":true,"playwright":true}`.

> El plan free de Render **duerme** tras inactividad; la primera petición puede tardar ~1 min.

### Alternativa: Railway

1. [railway.app](https://railway.app) → New Project → Deploy from repo.
2. Root directory: `/`, Dockerfile path: `analyzer/Dockerfile`.
3. Variable `PLAYWRIGHT_ENABLED=true`.

## 2. Desplegar la web — Vercel gratis

1. Importa el repo en [vercel.com](https://vercel.com).
2. Framework: **Astro** (auto).
3. **Environment variables**:

| Variable | Valor |
|----------|--------|
| `PUBLIC_ANALYZE_API_URL` | URL del analyzer **sin** barra final, p. ej. `https://theme-inspector-analyzer.onrender.com` |

4. Deploy.

No hace falta Playwright en Vercel.

## Desarrollo local

### Solo front (sin captura)

```sh
pnpm install
pnpm dev
```

### Front + Playwright en el mismo equipo

Terminal 1 — analyzer:

```sh
cd analyzer
pnpm install
pnpm start
```

Terminal 2 — Astro:

```sh
# .env en la raíz del proyecto:
# PUBLIC_ANALYZE_API_URL=http://localhost:3001

pnpm dev
```

O sin analyzer: deja `PUBLIC_ANALYZE_API_URL` vacío y usa las rutas `/api/*` de Astro (Playwright si no estás en `VERCEL=1`).

## Scripts

| Comando | Dónde | Acción |
|---------|--------|--------|
| `pnpm dev` | raíz | UI Astro |
| `pnpm build` | raíz | Build Vercel |
| `pnpm start` | `analyzer/` | API con Playwright |

## Coste

| Servicio | Plan | Uso |
|----------|------|-----|
| Vercel | Hobby | UI |
| Render | Free | Analyzer + Playwright |

Sin tarjeta en Vercel Hobby; Render free tiene límites de horas y cold starts.

## Seguridad

Medidas aplicadas en el código:

| Medida | Descripción |
|--------|-------------|
| **SSRF** | Bloqueo de IPs privadas, localhost, metadata, URLs con credenciales, redirects validados |
| **CORS** | En producción el analyzer exige `ALLOWED_ORIGINS` (p. ej. `https://tu-app.vercel.app,https://*.vercel.app`) |
| **Rate limit** | ~30 análisis / 15 min por IP en el analyzer |
| **XSS** | Valores de CSS escapados al renderizar HTML en el cliente |
| **Errores** | En producción no se filtran detalles internos de excepciones |
| **Cabeceras** | CSP, `X-Frame-Options`, etc. en Vercel y en el analyzer |
| **API key** | Opcional: `ANALYZER_API_KEY` + cabecera `X-Analyzer-Key` (solo servidor, no en el navegador) |

Recomendaciones:

- No pegues URLs con tokens (`?key=`, reset de contraseña, etc.).
- Define `ALLOWED_ORIGINS` en Render antes de abrir el analyzer al público.
- El informe y la captura quedan en `sessionStorage` del navegador del usuario.
