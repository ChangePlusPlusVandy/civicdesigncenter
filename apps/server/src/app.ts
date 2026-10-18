import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { ENGINE_VERSION } from "@cs/engine";
import type { HealthResponse } from "@cs/shared";

type AppOptions = {
  // Built web client to serve (production). Omit in dev, where Vite serves it.
  webDist?: string;
};

export function createApp({ webDist }: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

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
