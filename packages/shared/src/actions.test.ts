import { describe, expect, it } from "vitest";
import { ActionIntentSchema } from "./actions.ts";

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
