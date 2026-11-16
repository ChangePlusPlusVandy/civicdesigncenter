import { describe, expect, it } from "vitest";
import { ActionIntentSchema } from "./actions.ts";
import { can, PLAYER_ROLES } from "./permissions.ts";

describe("can (ARCH-015)", () => {
  const actionTypes = ActionIntentSchema.options.map(
    (option) => option.shape.type.value,
  );

  it("allows every player role every player action", () => {
    for (const role of PLAYER_ROLES) {
      for (const type of actionTypes) expect(can(role, type)).toBe(true);
    }
  });

  it("allows nothing to a role it does not know", () => {
    for (const role of ["observer", "", "constructor", "__proto__"]) {
      expect(can(role, "giftResource")).toBe(false);
    }
  });
});
