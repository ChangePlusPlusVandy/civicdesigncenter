import { describe, expect, it } from "vitest";
import { BUILDINGS, MARKET, START } from "./content.ts";
import { marketPrice, upgradeCost } from "./economy.ts";
import { project } from "./projection.ts";
import { createGame, reduce } from "./rules.ts";
import type { Actor, CityState, IdleState, Intent } from "./types.ts";

const teacher: Actor = { kind: "teacher" };
const system: Actor = { kind: "system" };
const green: Actor = { kind: "player", cityId: "green" };
const blue: Actor = { kind: "player", cityId: "blue" };

function apply(state: IdleState, actor: Actor, intent: Intent): IdleState {
  const result = reduce(state, actor, intent);
  if (!result.ok) throw new Error(`${intent.type}: ${result.error.message}`);
  return result.state;
}

function errorOf(state: IdleState, actor: Actor, intent: Intent) {
  const result = reduce(state, actor, intent);
  return result.ok ? null : result.error.code;
}

function running(): IdleState {
  return apply(createGame(5), teacher, { type: "start" });
}

function city(state: IdleState, id: "green" | "blue" = "green"): CityState {
  return state.cities[id] as CityState;
}

// Plenty of everything. Copper defaults to 0 so market buys fit in storage.
function rich(
  state: IdleState,
  id: "green" | "blue" = "green",
  copper = 0,
): IdleState {
  return {
    ...state,
    cities: {
      ...state.cities,
      [id]: {
        ...city(state, id),
        coins: 1000,
        goods: { food: 100, wood: 100, clay: 100, copper },
      },
    },
  };
}

describe("createGame", () => {
  it("gives every city a Town Hall and the starting kit", () => {
    const state = createGame(3);
    expect(state.cityIds).toEqual(["red", "green", "pink"]);
    expect(city(state).buildings.map((b) => b.kind)).toEqual(["hall"]);
    expect(city(state).coins).toBe(START.coins);
    expect(state.phase).toBe("lobby");
  });
});

describe("building", () => {
  it("builds on your own land and pays for it", () => {
    const state = apply(running(), green, {
      type: "build",
      payload: { kind: "farm", x: 9, y: 2 },
    });
    expect(city(state).buildings).toHaveLength(2);
    expect(city(state).coins).toBe(
      START.coins - (BUILDINGS.farm.cost.coins ?? 0),
    );
    expect(city(state).goals).toContain("first-farm");
  });

  it("explains why a tile is not allowed", () => {
    const state = running();
    expect(
      errorOf(state, green, {
        type: "build",
        payload: { kind: "farm", x: 2, y: 2 },
      }),
    ).toBe("NOT_YOUR_LAND");
    expect(
      errorOf(state, green, {
        type: "build",
        payload: { kind: "farm", x: 10, y: 1 },
      }),
    ).toBe("OCCUPIED");
    expect(
      errorOf(state, green, {
        type: "build",
        payload: { kind: "lumber-camp", x: 9, y: 2 },
      }),
    ).toBe("NEEDS_NEIGHBOR");
    const broke = {
      ...state,
      cities: { ...state.cities, green: { ...city(state), coins: 0 } },
    };
    expect(
      errorOf(broke, green, {
        type: "build",
        payload: { kind: "farm", x: 9, y: 2 },
      }),
    ).toBe("CANT_AFFORD");
  });

  it("only lets players act while the game runs", () => {
    const lobby = createGame(5);
    expect(
      errorOf(lobby, green, {
        type: "build",
        payload: { kind: "farm", x: 9, y: 2 },
      }),
    ).toBe("WRONG_PHASE");
    const paused = apply(running(), teacher, { type: "pause" });
    expect(
      errorOf(paused, green, {
        type: "build",
        payload: { kind: "farm", x: 9, y: 2 },
      }),
    ).toBe("WRONG_PHASE");
  });

  it("upgrades up to level 3 with copper", () => {
    let state = rich(
      apply(running(), green, {
        type: "build",
        payload: { kind: "farm", x: 9, y: 2 },
      }),
      "green",
      50,
    );
    const id = city(state).buildings[1]?.id ?? "";
    const before = city(state).goods.copper;
    state = apply(state, green, {
      type: "upgrade",
      payload: { buildingId: id },
    });
    expect(city(state).goods.copper).toBe(
      before - (upgradeCost("farm", 2).copper ?? 0),
    );
    state = apply(state, green, {
      type: "upgrade",
      payload: { buildingId: id },
    });
    expect(city(state).goals).toContain("level-three");
    expect(
      errorOf(state, green, { type: "upgrade", payload: { buildingId: id } }),
    ).toBe("MAX_LEVEL");
  });

  it("toggles and demolishes only your own workplaces", () => {
    let state = apply(running(), green, {
      type: "build",
      payload: { kind: "farm", x: 9, y: 2 },
    });
    const id = city(state).buildings[1]?.id ?? "";
    state = apply(state, green, {
      type: "toggle",
      payload: { buildingId: id },
    });
    expect(city(state).buildings[1]?.running).toBe(false);
    expect(
      errorOf(state, blue, { type: "toggle", payload: { buildingId: id } }),
    ).toBe("NOT_FOUND");
    expect(
      errorOf(state, green, {
        type: "toggle",
        payload: { buildingId: "green-hall" },
      }),
    ).toBe("NOT_ALLOWED");
    expect(
      errorOf(state, green, {
        type: "demolish",
        payload: { buildingId: "green-hall" },
      }),
    ).toBe("NOT_ALLOWED");
    state = apply(state, green, {
      type: "demolish",
      payload: { buildingId: id },
    });
    expect(city(state).buildings).toHaveLength(1);
  });
});

describe("ticks", () => {
  it("runs workplaces, feeds people and collects taxes", () => {
    let state = apply(running(), green, {
      type: "build",
      payload: { kind: "fishing-dock", x: 9, y: 0 },
    });
    const fishBefore = state.commons.river.stocks.fish ?? 0;
    state = apply(state, system, { type: "tick" });
    const dock = city(state).buildings.find((b) => b.kind === "fishing-dock");
    expect(dock?.status).toBe("ok");
    expect(dock?.lastOutput.food).toBe(1.5);
    expect(state.commons.river.stocks.fish).toBeLessThan(fishBefore + 2);
    expect(city(state).coins).toBeGreaterThan(START.coins - 25);
    expect(state.tick).toBe(1);
  });

  it("leaves buildings idle when there are not enough workers", () => {
    let state = rich(running());
    for (const [x, y] of [
      [9, 2],
      [9, 3],
      [11, 3],
      [12, 3],
      [12, 1],
    ] as const) {
      state = apply(state, green, {
        type: "build",
        payload: { kind: "farm", x, y },
      });
    }
    state = apply(state, system, { type: "tick" });
    const statuses = city(state)
      .buildings.filter((b) => b.kind === "farm")
      .map((b) => b.status);
    expect(statuses.filter((s) => s === "ok")).toHaveLength(START.population);
    expect(statuses).toContain("no-workers");
  });

  it("rejects ticks outside the running phase and from players", () => {
    expect(errorOf(createGame(5), system, { type: "tick" })).toBe(
      "WRONG_PHASE",
    );
    expect(errorOf(running(), green, { type: "tick" })).toBe("NOT_ALLOWED");
  });
});

describe("market", () => {
  it("prices rise as the market runs low", () => {
    let state = rich(running());
    const before = marketPrice(state, "copper").buy;
    for (let i = 0; i < 4; i++) {
      state = apply(state, green, {
        type: "marketBuy",
        payload: { good: "copper", amount: MARKET.maxPerOrder },
      });
    }
    expect(marketPrice(state, "copper").buy).toBeGreaterThan(before);
    expect(state.market.copper).toBe(MARKET.target - 4 * MARKET.maxPerOrder);
  });

  it("sells for coins and rejects bad orders", () => {
    const state = running();
    const sold = apply(state, green, {
      type: "marketSell",
      payload: { good: "wood", amount: 5 },
    });
    expect(city(sold).coins).toBe(
      START.coins + 5 * marketPrice(state, "wood").sell,
    );
    expect(
      errorOf(state, green, {
        type: "marketSell",
        payload: { good: "copper", amount: 1 },
      }),
    ).toBe("CANT_AFFORD");
    expect(
      errorOf(state, green, {
        type: "marketBuy",
        payload: { good: "wood", amount: 0 },
      }),
    ).toBe("BAD_REQUEST");
    expect(
      errorOf(state, green, {
        type: "marketBuy",
        payload: { good: "copper", amount: 20 },
      }),
    ).toBe("CANT_AFFORD");
  });
});

describe("trades", () => {
  it("swaps goods when the other city accepts", () => {
    let state = apply(running(), green, {
      type: "proposeTrade",
      payload: { to: "blue", give: { wood: 5 }, get: { coins: 10 } },
    });
    const offerId = state.offers[0]?.id ?? "";
    expect(
      errorOf(state, green, { type: "acceptTrade", payload: { offerId } }),
    ).toBe("NOT_FOUND");
    state = apply(state, blue, { type: "acceptTrade", payload: { offerId } });
    expect(city(state).goods.wood).toBe(START.goods.wood - 5);
    expect(city(state, "blue").coins).toBe(START.coins - 10);
    expect(city(state).goals).toContain("first-trade");
    expect(state.offers[0]?.status).toBe("accepted");
  });

  it("can be declined or cancelled, and checks what you have", () => {
    const base = apply(running(), green, {
      type: "proposeTrade",
      payload: { to: "blue", give: { food: 1 }, get: { clay: 1 } },
    });
    const offerId = base.offers[0]?.id ?? "";
    expect(
      apply(base, blue, { type: "declineTrade", payload: { offerId } })
        .offers[0]?.status,
    ).toBe("declined");
    expect(
      apply(base, green, { type: "cancelTrade", payload: { offerId } })
        .offers[0]?.status,
    ).toBe("cancelled");
    expect(
      errorOf(running(), green, {
        type: "proposeTrade",
        payload: { to: "blue", give: { coins: 9999 }, get: {} },
      }),
    ).toBe("CANT_AFFORD");
    expect(
      errorOf(running(), green, {
        type: "proposeTrade",
        payload: { to: "green", give: { food: 1 }, get: {} },
      }),
    ).toBe("BAD_REQUEST");
  });
});

describe("town meeting", () => {
  it("passes policies with more yes than no votes and ends the season", () => {
    let state = apply(running(), teacher, {
      type: "startMeeting",
      payload: { policyIds: ["park-fund", "free-trade"] },
    });
    expect(
      errorOf(state, green, {
        type: "build",
        payload: { kind: "farm", x: 9, y: 2 },
      }),
    ).toBe("WRONG_PHASE");
    state = apply(state, green, {
      type: "vote",
      payload: { policyId: "park-fund", yes: true },
    });
    state = apply(state, blue, {
      type: "vote",
      payload: { policyId: "park-fund", yes: true },
    });
    state = apply(state, blue, {
      type: "vote",
      payload: { policyId: "free-trade", yes: false },
    });
    state = apply(state, teacher, { type: "closeMeeting" });

    expect(state.policies).toEqual(["park-fund"]);
    expect(state.season).toBe(2);
    expect(state.phase).toBe("paused");
    expect(city(state).coins).toBe(START.coins - 20);
    expect(city(state).lastReport?.season).toBe(1);
    expect(
      errorOf(state, teacher, {
        type: "startMeeting",
        payload: { policyIds: ["park-fund"] },
      }),
    ).toBe("BAD_REQUEST");
  });
});

describe("projection", () => {
  it("keeps other cities' coins and goods private", () => {
    const state = running();
    const view = project(
      state,
      { kind: "player", cityId: "green", playerId: "p1", name: "Ana" },
      7,
      { green: ["Ana"] },
    );
    expect(view.version).toBe(7);
    expect(view.myCity?.coins).toBe(START.coins);
    expect(view.allCities).toBeNull();
    expect(JSON.stringify(view.cities)).not.toContain('"coins"');
    expect(view.cities.find((c) => c.id === "green")?.players).toEqual(["Ana"]);

    const teacherView = project(state, { kind: "teacher" }, 7, {});
    expect(teacherView.allCities).toHaveLength(5);
  });
});
