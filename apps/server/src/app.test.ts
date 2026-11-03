import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isHealthResponse } from "@cs/shared";
import { createApp } from "./app.ts";

let server: Server;
let baseUrl: string;
let webDist: string;

beforeAll(async () => {
  webDist = mkdtempSync(path.join(tmpdir(), "web-dist-"));
  writeFileSync(
    path.join(webDist, "index.html"),
    "<!doctype html><title>spa</title>",
  );
  server = createApp({
    webDist,
    corsOrigins: ["https://extra.example.org"],
  }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  rmSync(webDist, { recursive: true, force: true });
});

describe("server app", () => {
  it("responds to health checks", async () => {
    for (const route of ["/healthz", "/api/healthz"]) {
      const res = await fetch(baseUrl + route);
      expect(res.status).toBe(200);
      expect(isHealthResponse(await res.json())).toBe(true);
    }
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("serves the SPA for client-side routes", async () => {
    const res = await fetch(`${baseUrl}/play/ABC123`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>spa</title>");
  });

  it("does not serve the SPA for socket.io paths", async () => {
    const res = await fetch(`${baseUrl}/socket.io/`);
    expect(res.status).toBe(404);
  });
});

describe("CORS", () => {
  const allowedOrigins = [
    "https://civicdesigncenter-abc123-changeplusplus.vercel.app",
    "https://extra.example.org",
  ];

  for (const origin of allowedOrigins) {
    it(`allows ${origin}`, async () => {
      const res = await fetch(`${baseUrl}/api/healthz`, {
        headers: { Origin: origin },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe(origin);
      expect(res.headers.get("vary")).toContain("Origin");
    });

    it(`answers preflight from ${origin}`, async () => {
      const res = await fetch(`${baseUrl}/api/healthz`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(origin);
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
      expect(res.headers.get("access-control-allow-headers")).toContain(
        "Authorization",
      );
    });
  }

  it("allows the server's own origin", async () => {
    const res = await fetch(`${baseUrl}/api/healthz`, {
      headers: { Origin: baseUrl },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(baseUrl);
  });

  it("sends no CORS headers to unlisted origins", async () => {
    for (const origin of [
      "https://evil.example.com",
      "http://not-https.vercel.app",
      "not a url",
    ]) {
      const res = await fetch(`${baseUrl}/api/healthz`, {
        headers: { Origin: origin },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});

describe("production start", () => {
  it("boots with no options and no env vars and serves /healthz", async () => {
    const bare = createApp().listen(0);
    await new Promise<void>((resolve) => bare.once("listening", resolve));
    const port = (bare.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://localhost:${port}/healthz`);
      expect(res.status).toBe(200);
      expect(isHealthResponse(await res.json())).toBe(true);
    } finally {
      bare.close();
    }
  });
});
