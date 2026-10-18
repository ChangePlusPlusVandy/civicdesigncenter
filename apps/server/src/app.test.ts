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
  server = createApp({ webDist }).listen(0);
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
