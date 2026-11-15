import { describe, expect, it } from "vitest";
import { ActionIntentSchema, parseActionMessage } from "./actions.ts";

const gift = (to: string, resource = "clay") => ({
  type: "giftResource",
  payload: { to, resource, amount: 1 },
});

describe("ActionIntentSchema", () => {
  it("accepts a well-formed gift", () => {
    expect(ActionIntentSchema.safeParse(gift("green")).success).toBe(true);
  });

  it("uses the scenario id format, so inherited keys never get through", () => {
    for (const bad of ["__proto__", "constructor", "Green", "", "a b", "1x"]) {
      const ok = ActionIntentSchema.safeParse(gift(bad)).success;
      // "constructor" is a valid id shape; the engine rejects it as an
      // unknown city (see reduce.test.ts).
      expect(ok).toBe(bad === "constructor");
    }
    expect(
      ActionIntentSchema.safeParse(gift("green", "__proto__")).success,
    ).toBe(false);
  });
});

describe("parseActionMessage (ARCH-081)", () => {
  it("splits the clientActionId from the intent", () => {
    expect(
      parseActionMessage({ clientActionId: "a1", ...gift("green") }),
    ).toEqual({ clientActionId: "a1", intent: gift("green") });
  });

  it.each([
    ["no clientActionId", gift("green")],
    ["an empty clientActionId", { clientActionId: "", ...gift("green") }],
    ["an extra key", { clientActionId: "a1", x: 1, ...gift("green") }],
    ["a bad payload", { clientActionId: "a1", ...gift("Green") }],
    ["a non-object", "giftResource"],
    ["an array", [gift("green")]],
    ["null", null],
  ])("rejects %s", (_name, raw) => {
    expect(parseActionMessage(raw)).toBeNull();
  });
});
