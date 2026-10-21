import { describe, expect, it } from "vitest";
import { normalizeRoomCode } from "./room-code";

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
