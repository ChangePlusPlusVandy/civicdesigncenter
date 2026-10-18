import { describe, expect, it } from "vitest";
import { isHealthResponse } from "./index.ts";

describe("isHealthResponse", () => {
  it("accepts a valid health payload", () => {
    expect(isHealthResponse({ ok: true, engineVersion: "0.0.0" })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isHealthResponse(null)).toBe(false);
    expect(isHealthResponse({ ok: false })).toBe(false);
  });
});
