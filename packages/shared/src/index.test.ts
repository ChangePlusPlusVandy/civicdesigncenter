import { describe, expect, it } from "vitest";
import { isHealthResponse, normalizeRoomCode } from "./index.ts";

describe("isHealthResponse", () => {
  it("accepts a valid health payload", () => {
    expect(isHealthResponse({ ok: true, engineVersion: "0.0.0" })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isHealthResponse(null)).toBe(false);
    expect(isHealthResponse({ ok: false })).toBe(false);
  });
});

describe("normalizeRoomCode", () => {
  it("normalizes valid room codes", () => {
    expect(normalizeRoomCode(" nash24 ")).toBe("NASH24");
  });

  it("rejects codes outside the supported length", () => {
    expect(normalizeRoomCode("ABC")).toBeNull();
    expect(normalizeRoomCode("ABCDEFGHI")).toBeNull();
  });

  it("rejects non-alphanumeric codes", () => {
    expect(normalizeRoomCode("NASH-24")).toBeNull();
  });
});
