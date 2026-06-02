import cors from "cors";
import express from "express";
import { handleAnalyzeRequest } from "../../src/lib/api/analyzeHandler.ts";
import {
  rateLimitAnalyze,
  requireAnalyzerApiKey,
  securityHeaders,
} from "./security/analyzerMiddleware.ts";

process.env.PLAYWRIGHT_ENABLED = "true";

const app = express();
const port = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === "production";

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(securityHeaders);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (!allowedOrigins?.length) {
        callback(isProd ? new Error("CORS not configured") : null, !isProd);
        return;
      }
      const ok = allowedOrigins.some(
        (allowed) =>
          allowed === origin || (allowed.includes("*") && matchWildcard(origin, allowed)),
      );
      callback(ok ? null : new Error("CORS blocked"), ok);
    },
    methods: ["GET", "POST", "OPTIONS"],
  }),
);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, playwright: true });
});

app.post("/api/analyze", requireAnalyzerApiKey, rateLimitAnalyze, async (req, res) => {
  const result = await handleAnalyzeRequest(req.body);
  res.status(result.status).set(result.headers ?? {}).json(result.body);
});

app.listen(port, () => {
  console.log(`Theme Inspector analyzer listening on :${port}`);
  if (isProd && !allowedOrigins?.length) {
    console.warn("WARN: ALLOWED_ORIGINS no definido — CORS bloqueado en producción.");
  }
  if (process.env.ANALYZER_API_KEY) {
    console.log("Analyzer API key protection: enabled");
  }
});

function matchWildcard(origin: string, pattern: string): boolean {
  if (!pattern.includes("*")) return origin === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(origin);
}
