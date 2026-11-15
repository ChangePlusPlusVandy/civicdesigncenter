import { describe, expect, it } from "vitest";
import type { ClientIntent } from "@cs/idle";
import { ActionIds } from "./actionIds";

const build: ClientIntent = {
  type: "build",
  payload: { kind: "farm", x: 1, y: 2 },
};

function ids() {
  let next = 0;
  return new ActionIds(() => `id${++next}`);
}

describe("ActionIds", () => {
  it("reuses the id when a retry follows a timeout", () => {
    const actions = ids();
    const first = actions.take(build);
    actions.settle(build, { ok: false, code: "OFFLINE", message: "" });
    expect(actions.take(build)).toBe(first);
  });

  it("starts a new id once the server has answered", () => {
    const actions = ids();
    const first = actions.take(build);
    actions.settle(build, { ok: true, version: 2 });
    expect(actions.take(build)).not.toBe(first);

    const second = actions.take(build);
    actions.settle(build, { ok: false, code: "CANT_AFFORD", message: "" });
    expect(actions.take(build)).not.toBe(second);
  });

  it("gives different actions different ids", () => {
    const actions = ids();
    expect(actions.take(build)).not.toBe(
      actions.take({ type: "upgrade", payload: { buildingId: "b1" } }),
    );
  });
});
