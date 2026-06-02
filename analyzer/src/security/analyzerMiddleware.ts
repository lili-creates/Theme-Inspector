import type { NextFunction, Request, Response } from "express";
import { checkRateLimit, pruneRateLimitBuckets } from "../../../src/lib/security/rateLimit.ts";
import { ANALYZER_API_KEY_HEADER, isAnalyzerApiKeyValid } from "./apiAuth.ts";

const ANALYZE_LIMIT = { windowMs: 15 * 60 * 1000, maxRequests: 30 };

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Permissions-Policy", "interest-cohort=()");
  next();
}

export function requireAnalyzerApiKey(req: Request, res: Response, next: NextFunction): void {
  if (isAnalyzerApiKeyValid(req.headers)) {
    next();
    return;
  }
  res.status(401).json({
    error: "Unauthorized",
    details: `Falta o es inválida la cabecera ${ANALYZER_API_KEY_HEADER} (si ANALYZER_API_KEY está configurada).`,
  });
}

export function rateLimitAnalyze(req: Request, res: Response, next: NextFunction): void {
  pruneRateLimitBuckets();
  const key = `analyze:${clientIp(req)}`;
  const result = checkRateLimit(key, ANALYZE_LIMIT);
  if (!result.allowed) {
    res.status(429).json({
      error: "Too many requests",
      details: `Espera ${result.retryAfterSec}s antes de volver a analizar.`,
    });
    return;
  }
  next();
}
