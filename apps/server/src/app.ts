import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { ENGINE_VERSION } from "@cs/engine";
import type { HealthResponse } from "@cs/shared";

type AppOptions = {
  // Built web client to serve (production). Omit in dev, where Vite serves it.
  webDist?: string;
  // Extra browser origins allowed by CORS, e.g. ["https://demo.example.org"].
  // Defaults to the comma-separated CORS_ORIGINS env var.
  corsOrigins?: string[];
};

const VERCEL_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function createApp({
  webDist,
  corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS),
}: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  // CORS allow-list: the server's own origin, Vercel previews, and corsOrigins.
  // Disallowed origins get no CORS headers, so the browser blocks the response.
  app.use((req, res, next) => {
    res.setHeader("Vary", "Origin");
    const origin = req.headers.origin;
    if (!origin) {
      // Same-origin or non-browser request.
      next();
      return;
    }

    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      next();
      return;
    }

    const allowed =
      originHost === req.headers.host ||
      VERCEL_PREVIEW_ORIGIN.test(origin) ||
      corsOrigins.includes(origin);
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      if (req.method === "OPTIONS") {
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,PATCH,DELETE",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );
        res.setHeader("Access-Control-Max-Age", "86400");
        res.sendStatus(204);
        return;
      }
    }
    next();
  });

  app.get(["/healthz", "/api/healthz"], (_req, res) => {
    const body: HealthResponse = { ok: true, engineVersion: ENGINE_VERSION };
    res.json(body);
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  if (webDist && existsSync(webDist)) {
    const indexHtml = path.join(webDist, "index.html");
    app.use(express.static(webDist));
    // SPA fallback: client-side routes get index.html; /api and /socket.io are left alone.
    app.get(/^(?!\/(?:api|socket\.io)(?:\/|$)).*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  return app;
}
