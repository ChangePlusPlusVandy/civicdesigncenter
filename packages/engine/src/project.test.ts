import { ScenarioSchema } from "@cs/shared";
import { describe, expect, it } from "vitest";
import lc2 from "../../../scenarios/lc2-default.json";
import { project } from "./project.ts";
import { createInitialState } from "./state.ts";
import type { GameState } from "./types.ts";

const scenario = ScenarioSchema.parse(lc2);
const state = createInitialState(scenario, 42);
state.cities.red!.resources.lumber = 9;

// Stands in for teacher-only state a later PR adds (sealed bids, ARCH-024),
// to check the allow-list keeps unknown fields out of other projections.
const withSecret = {
  ...state,
  bids: { red: { lot1: 3 } },
} as GameState & { bids: unknown };

describe("project (ARCH-023)", () => {
  it("gives the teacher the full state", () => {
    const p = project(withSecret, { kind: "teacher" });
    expect(p.audience).toBe("teacher");
    expect(p).toMatchObject({ ...withSecret });
  });

  it("gives the projector every city's stats and no resources, seed or rng", () => {
    const p = project(withSecret, { kind: "projector" });
    expect(Object.keys(p).sort()).toEqual(
      ["audience", "cities", "features", "round", "scenarioId"].sort(),
    );
    expect(Object.keys(p.cities).sort()).toEqual(
      Object.keys(state.cities).sort(),
    );
    for (const city of Object.values(p.cities)) {
      expect(Object.keys(city)).toEqual(["stats"]);
    }
  });

  it("gives a team only its own city (ARCH-082)", () => {
    const p = project(withSecret, { kind: "team", cityId: "red" });
    expect(p.cityId).toBe("red");
    expect(p.city?.resources.lumber).toBe(9);
    expect(JSON.stringify(p)).not.toContain("green");
    expect(p).not.toHaveProperty("bids");
    expect(p).not.toHaveProperty("rng");
    expect(p).not.toHaveProperty("seed");
    expect(p).not.toHaveProperty("features"); // RULE-032, until #20
  });

  it("gives a seat without a team no city", () => {
    const p = project(state, { kind: "team", cityId: null });
    expect(p.city).toBeNull();
    expect(project(state, { kind: "team", cityId: "nope" }).city).toBeNull();
  });

  it("gives the reserved player audience the team's data", () => {
    const team = project(state, { kind: "team", cityId: "red" });
    const player = project(state, {
      kind: "player",
      cityId: "red",
      participantId: "p1",
    });
    expect({ ...player, audience: "team" }).toEqual(team);
  });

  it("returns copies that share nothing with the state", () => {
    const p = project(state, { kind: "team", cityId: "red" });
    p.city!.resources.lumber = 0;
    const t = project(state, { kind: "teacher" });
    t.cities.red!.resources.lumber = 0;
    expect(state.cities.red!.resources.lumber).toBe(9);
  });
});
