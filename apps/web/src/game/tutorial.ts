// A short hands-on "first day" for students. Action steps finish when the
// city actually does the thing (a teammate doing it counts too), so nobody
// gets stuck behind a step their team already did.

import { useState } from "react";
import { getMap, type PrivateCity, type Projection } from "@cs/idle";
import type { AdvisorTab } from "./advisor";

export type TutorialTarget =
  "map" | "hud" | "build-farm" | "build-house" | "city-tab";

interface Context {
  state: Projection;
  city: PrivateCity;
  tab: AdvisorTab;
}

export interface TutorialStep {
  id: string;
  title: (ctx: Context) => string;
  body: (ctx: Context) => string;
  target: TutorialTarget;
  // Action steps: finished once this is true. Info steps have a Next button.
  done?: (ctx: Context) => boolean;
}

const has = (city: PrivateCity, ...kinds: string[]) =>
  city.buildings.some((b) => kinds.includes(b.kind));

export const STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: ({ city }) => `Welcome to ${city.name}!`,
    body: () =>
      "The land inside the colored fence is your city. Everyone on your team builds it together, each from their own device.",
    target: "map",
  },
  {
    id: "resources",
    title: () => "Your city's supplies",
    body: () =>
      "Coins come from taxes. Food feeds your people, and wood and clay are for building. The small green or red number shows what you gain or lose each day.",
    target: "hud",
  },
  {
    id: "farm",
    title: () => "Grow some food",
    body: () =>
      "Tap Farm in the Build list, then tap a green spot on your land.",
    target: "build-farm",
    done: ({ city }) => has(city, "farm", "fishing-dock"),
  },
  {
    id: "house",
    title: () => "Make room for more people",
    body: () =>
      "New people only move in if there are homes. Build Houses the same way. They use wood and clay.",
    target: "build-house",
    done: ({ city }) => has(city, "house"),
  },
  {
    id: "city",
    title: () => "See how your city feels",
    body: () =>
      "Open the City tab to see why people are happy or not, how things are changing, and what your team has done.",
    target: "city-tab",
    done: ({ tab }) => tab === "city",
  },
  {
    id: "share",
    title: () => "You're not alone",
    body: ({ state }) => {
      const map = getMap(state.mapId);
      return `Your city shares ${map.commonsNames.river} and the woods with other cities. If everyone takes too much, they run out for everyone. Talk to your neighbors and trade!`;
    },
    target: "map",
  },
];

const key = (playerId: string | undefined) =>
  `citysettlers:tutorial:${playerId ?? "anon"}`;

function wasFinished(playerId: string | undefined): boolean {
  try {
    return localStorage.getItem(key(playerId)) === "done";
  } catch {
    return false;
  }
}

function markFinished(playerId: string | undefined) {
  try {
    localStorage.setItem(key(playerId), "done");
  } catch {
    // Storage blocked: the tutorial may show again after a refresh.
  }
}

export function useTutorial(ctx: Context) {
  const playerId = ctx.state.me?.playerId;
  const [index, setIndex] = useState(() =>
    wasFinished(playerId) ? STEPS.length : 0,
  );

  // Skip action steps the team has already done.
  let current = index;
  while (current < STEPS.length && STEPS[current]?.done?.(ctx)) current++;
  const step = STEPS[current] ?? null;

  const finish = () => {
    markFinished(playerId);
    setIndex(STEPS.length);
  };
  const next = () => {
    if (current + 1 >= STEPS.length) finish();
    else setIndex(current + 1);
  };

  return { step, number: current + 1, total: STEPS.length, next, skip: finish };
}
