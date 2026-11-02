// "What should I do next?" Reads the student's city and the shared nature
// and suggests the most useful next step, in plain words.

import {
  BUILDINGS,
  canAfford,
  citiesBordering,
  cityInfo,
  placementProblem,
  plotTiles,
  type BuildableKind,
  type PrivateCity,
  type Projection,
} from "@cs/idle";

export type AdvisorTab = "build" | "market" | "trade" | "city";

export interface Tip {
  id: string;
  // Warnings are problems happening now; ideas are what to try next.
  tone: "warn" | "idea";
  icon: string;
  text: string;
  action?: { label: string; build?: BuildableKind; tab?: AdvisorTab };
}

function has(city: PrivateCity, kind: BuildableKind): boolean {
  return city.buildings.some((b) => b.kind === kind);
}

function canPlaceSomewhere(city: PrivateCity, kind: BuildableKind): boolean {
  return plotTiles(cityInfo(city.id)).some(
    ({ x, y }) =>
      placementProblem(
        {
          ...city,
          coins: Infinity,
          goods: { food: 1e9, wood: 1e9, clay: 1e9, copper: 1e9 },
        },
        kind,
        x,
        y,
      ) === null,
  );
}

function build(kind: BuildableKind): Tip["action"] {
  return { label: `Build a ${BUILDINGS[kind].name}`, build: kind };
}

export function advise(game: Projection, city: PrivateCity): Tip[] {
  const tips: Tip[] = [];
  const bordersWoods =
    citiesBordering("westWoods").includes(city.id) ||
    citiesBordering("eastWoods").includes(city.id);
  const borderingCollapsed = game.commons.filter(
    (c) => c.collapsed && citiesBordering(c.id).includes(city.id),
  );
  const daysOfFood =
    city.income.food < 0 ? city.goods.food / -city.income.food : Infinity;

  // Problems first.
  if (city.goods.food < 1 || daysOfFood < 15) {
    tips.push({
      id: "hungry",
      tone: "warn",
      icon: "🌾",
      text:
        city.goods.food < 1
          ? "Your people are hungry! They'll start leaving."
          : "Food is running low.",
      action: canAfford(city, BUILDINGS.farm.cost)
        ? build("farm")
        : { label: "Buy food at the Market", tab: "market" },
    });
  }
  for (const commons of borderingCollapsed) {
    tips.push({
      id: `collapsed-${commons.id}`,
      tone: "warn",
      icon: commons.id === "river" ? "🐟" : "🌲",
      text: `${commons.name} is used up. Stop the buildings that take from it so it can grow back.`,
      action: { label: "See nature health", tab: "city" },
    });
  }
  if (city.buildings.some((b) => b.running && b.status === "no-workers")) {
    tips.push({
      id: "workers",
      tone: "warn",
      icon: "👷",
      text: "Some buildings have no workers. More people means more workers: you need food and homes.",
      action:
        city.population >= city.housing
          ? build("house")
          : { label: "Why aren't people moving in?", tab: "city" },
    });
  }
  if (city.population >= city.housing) {
    tips.push({
      id: "homes",
      tone: "warn",
      icon: "🏠",
      text: "Every home is full, so nobody new can move in.",
      action: canAfford(city, BUILDINGS.house.cost)
        ? build("house")
        : { label: "Get wood and clay for houses", tab: "market" },
    });
  }
  if (city.pollution >= 8) {
    tips.push({
      id: "pollution",
      tone: "warn",
      icon: "🏭",
      text: "Pollution is making people unhappy and dirtying the nature you share.",
      action: build("park"),
    });
  }
  if (city.happiness < 40) {
    tips.push({
      id: "unhappy",
      tone: "warn",
      icon: "😐",
      text: "People only move in when happiness is 40 or more.",
      action: { label: "See why", tab: "city" },
    });
  }

  // Then ideas, roughly in the order a new city needs them.
  if (!has(city, "farm") && !has(city, "fishing-dock")) {
    tips.push({
      id: "first-food",
      tone: "idea",
      icon: "🌾",
      text: "Start with food: a Farm feeds your people so the city can grow.",
      action: build("farm"),
    });
  }
  if (!has(city, "lumber-camp")) {
    tips.push(
      bordersWoods && canPlaceSomewhere(city, "lumber-camp")
        ? {
            id: "wood",
            tone: "idea",
            icon: "🪓",
            text: "Almost everything needs wood. Build a Lumber Camp next to the woods.",
            action: build("lumber-camp"),
          }
        : {
            id: "wood-trade",
            tone: "idea",
            icon: "🪵",
            text: "Your city has no woods. Buy wood at the Market, or trade with a city that has some.",
            action: { label: "Open the Market", tab: "market" },
          },
    );
  }
  if (!has(city, "clay-pit")) {
    tips.push({
      id: "clay",
      tone: "idea",
      icon: "🧱",
      text: "Houses need clay. A Clay Pit next to a clay deposit makes extra.",
      action: build("clay-pit"),
    });
  }
  if (!has(city, "house") && city.population >= city.housing - 2) {
    tips.push({
      id: "first-house",
      tone: "idea",
      icon: "🏠",
      text: "Build Houses so more people can move in. More people means more taxes.",
      action: build("house"),
    });
  }
  if (!has(city, "park")) {
    tips.push({
      id: "park",
      tone: "idea",
      icon: "🌳",
      text: "Parks make people happier, and happy people pay more taxes.",
      action: build("park"),
    });
  }
  if (city.goods.copper < 3 && city.buildings.length >= 5) {
    tips.push({
      id: "copper",
      tone: "idea",
      icon: "🔶",
      text: "Upgrades need copper. Mine it, buy it, or trade for it.",
      action: { label: "Open the Market", tab: "market" },
    });
  }
  if (city.tradesCompleted === 0 && city.buildings.length >= 4) {
    tips.push({
      id: "trade",
      tone: "idea",
      icon: "🤝",
      text: "Talk to another city and trade what you have extra of.",
      action: { label: "Make an offer", tab: "trade" },
    });
  }
  tips.push({
    id: "upgrade",
    tone: "idea",
    icon: "⭐",
    text: "Tap one of your buildings to upgrade it. Bigger buildings make more.",
  });
  return tips;
}
