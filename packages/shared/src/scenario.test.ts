import { describe, expect, it } from "vitest";
import lc2 from "../../../scenarios/lc2-default.json";
import { z } from "zod";
import { ScenarioSchema } from "./scenario.ts";

type ScenarioInput = z.input<typeof ScenarioSchema>;

// A fresh, editable copy of the reference scenario.
function scenario() {
  return JSON.parse(JSON.stringify(lc2)) as ScenarioInput;
}

// Parses and returns the issue messages ("" when it parses).
function issues(input: unknown): string {
  const result = ScenarioSchema.safeParse(input);
  return result.success
    ? ""
    : result.error.issues.map((i) => i.message).join("\n");
}

describe("ScenarioSchema", () => {
  it("accepts lc2-default.json", () => {
    expect(issues(lc2)).toBe("");
    const parsed = ScenarioSchema.parse(lc2);
    expect(parsed.cities.map((c) => c.id)).toEqual([
      "red",
      "green",
      "pink",
      "blue",
      "yellow",
    ]);
    expect(parsed.buildings).toHaveLength(6);
  });

  it("rejects unknown fields", () => {
    const s = { ...scenario(), extra: true };
    expect(issues(s)).not.toBe("");
  });

  it("rejects a wrong schema version", () => {
    expect(issues({ ...scenario(), schemaVersion: 2 })).not.toBe("");
  });

  it("rejects duplicate ids", () => {
    const s = scenario();
    s.cities.push({ ...s.cities[0]! });
    expect(issues(s)).toMatch(/duplicate id "red"/);
  });

  it("rejects a resource named like a stat", () => {
    const s = scenario();
    s.resources.push({ id: "pollution", name: "Pollution" });
    expect(issues(s)).toMatch(/"pollution" is a stat/);
  });

  it("rejects undeclared resources in starting stock", () => {
    const s = scenario();
    s.start.resources.gold = 3;
    expect(issues(s)).toMatch(/unknown resource or stat "gold"/);
  });

  it("rejects undeclared resources in building upkeep and output", () => {
    const s = scenario();
    s.buildings[0]!.upkeep.steel = 1;
    expect(issues(s)).toMatch(/"steel"/);

    const t = scenario();
    t.buildings[0]!.output.gold = 1;
    expect(issues(t)).toMatch(/"gold"/);
  });

  it("rejects stats in upkeep", () => {
    const s = scenario();
    s.buildings[0]!.upkeep.happiness = 1;
    expect(issues(s)).toMatch(/"happiness"/);
  });

  it("rejects an adjacency kind no feature has", () => {
    const s = scenario();
    s.buildings[0]!.adjacency!.featureKind = "volcano";
    expect(issues(s)).toMatch(/no feature has kind "volcano"/);
  });

  it("rejects undeclared resources in feature stocks", () => {
    const s = scenario();
    s.features[0]!.stocks.gems = 5;
    expect(issues(s)).toMatch(/"gems"/);
  });

  it("rejects a map with the wrong number of rows or columns", () => {
    const s = scenario();
    s.map.tiles.pop();
    expect(issues(s)).toMatch(/expected 16 rows, got 15/);

    const t = scenario();
    t.map.tiles[0] = t.map.tiles[0]!.slice(1);
    expect(issues(t)).toMatch(/expected 16 tiles, got 15/);
  });

  it("rejects tile characters missing from the legend", () => {
    const s = scenario();
    s.map.tiles[0] = "X" + s.map.tiles[0]!.slice(1);
    expect(issues(s)).toMatch(/"X" at x=0 is not in the legend/);
  });

  it("rejects a legend entry for an unknown feature", () => {
    const s = scenario();
    s.map.legend.Z = "swamp";
    expect(issues(s)).toMatch(/unknown feature "swamp"/);
  });

  it("rejects a feature with no tiles", () => {
    const s = scenario();
    s.map.tiles = s.map.tiles.map((row) => row.replaceAll("u", "."));
    expect(issues(s)).toMatch(/feature "copper-deposit" has no tiles/);
  });

  it("rejects plots outside the map", () => {
    const s = scenario();
    s.cities[0]!.plot.x = 14;
    expect(issues(s)).toMatch(/plot is outside the map/);
  });

  it("rejects a view that does not contain the plot", () => {
    const s = scenario();
    s.cities[0]!.view = { x: 3, y: 3, width: 2, height: 2 };
    expect(issues(s)).toMatch(/view must contain the plot/);
  });

  it("rejects plots that overlap each other", () => {
    const s = scenario();
    s.cities[1]!.plot = { ...s.cities[0]!.plot };
    s.cities[1]!.view = { ...s.cities[0]!.view };
    expect(issues(s)).toMatch(/plot overlaps another plot or a feature/);
  });

  it("rejects plots that overlap a feature", () => {
    const s = scenario();
    // Red City's plot moved one tile down reaches row 5, where the west woods start at x=1.
    s.cities[0]!.plot.y = 2;
    expect(issues(s)).toMatch(/plot overlaps another plot or a feature at 1,5/);
  });
});
