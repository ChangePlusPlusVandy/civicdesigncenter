import { describe, expect, it } from "vitest";
import { catalogProblem } from "./catalog.ts";

describe("event catalog", () => {
  it("accepts a well-formed event and refuses anything else", () => {
    expect(
      catalogProblem(
        {
          type: "market.bought",
          payload: { good: "wood", amount: 2, price: 3, total: 6 },
        },
        "accepted",
      ),
    ).toBeNull();
    expect(
      catalogProblem(
        { type: "market.bought", payload: { good: "gold" } },
        "accepted",
      ),
    ).toMatch(/market\.bought/);
    expect(
      catalogProblem(
        {
          type: "market.bought",
          payload: { good: "wood", amount: 2, price: 3, total: 6, name: "Ana" },
        },
        "accepted",
      ),
    ).not.toBeNull();
    expect(
      catalogProblem({ type: "made.up", payload: {} }, "accepted"),
    ).toMatch(/Unknown event type/);
    expect(
      catalogProblem({ type: "toString", payload: {} }, "accepted"),
    ).toMatch(/Unknown event type/);
  });

  it("checks rejected attempts as the intent that was refused", () => {
    const intent = { type: "upgrade", payload: { buildingId: "b9" } };
    expect(
      catalogProblem({ type: "upgrade", payload: { intent } }, "rejected"),
    ).toBeNull();
    expect(
      catalogProblem(
        { type: "upgrade", payload: { intent: { type: "upgrade" } } },
        "rejected",
      ),
    ).not.toBeNull();
    expect(
      catalogProblem({ type: "action.invalid", payload: {} }, "rejected"),
    ).toBeNull();
  });
});
