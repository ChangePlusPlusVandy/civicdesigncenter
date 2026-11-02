import {
  BUILDINGS,
  COMMONS_NAMES,
  EVENTS,
  GOALS,
  GOOD_INFO,
  POLICIES,
  cityInfo,
  type BuildingKind,
  type CityId,
  type CommonsId,
  type EventKind,
  type GoalId,
  type Good,
  type LoggedEvent,
  type PolicyId,
} from "@cs/idle";

export const panel = "rounded-xl border bg-card/95 shadow-lg backdrop-blur-md";

export const COIN = "🪙";

export function bundleIcon(key: string): string {
  return key === "coins" ? COIN : GOOD_INFO[key as Good].icon;
}

export function bundleName(key: string): string {
  return key === "coins" ? "Coins" : GOOD_INFO[key as Good].name;
}

export function happinessFace(value: number): string {
  if (value >= 75) return "😄";
  if (value >= 55) return "🙂";
  if (value >= 40) return "😐";
  if (value >= 25) return "🙁";
  return "😢";
}

export interface Toast {
  id: number;
  text: string;
  tone: "good" | "bad" | "info";
}

// Plain-language messages for the game events a student should notice.
export function describeEvent(
  event: LoggedEvent,
): { text: string; tone: Toast["tone"] } | null {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "goal.achieved":
      return {
        text: `🏆 Goal reached: ${GOALS[payload.goal as GoalId].name}!`,
        tone: "good",
      };
    case "commons.collapsed":
      return {
        text: `⚠️ ${COMMONS_NAMES[payload.commons as CommonsId]} is used up! Nothing can be taken until it grows back.`,
        tone: "bad",
      };
    case "commons.recovered":
      return {
        text: `🌱 ${COMMONS_NAMES[payload.commons as CommonsId]} is growing back.`,
        tone: "good",
      };
    case "policy.passed":
      return {
        text: `📜 New rule passed: ${POLICIES[payload.policyId as PolicyId].name}`,
        tone: "info",
      };
    case "event.triggered": {
      const info = EVENTS[payload.kind as EventKind];
      return { text: `${info.name}! ${info.summary}`, tone: "info" };
    }
    case "meeting.started":
      return {
        text: "🏛️ Town Meeting! Talk with your team, then vote.",
        tone: "info",
      };
    case "game.started":
      return { text: "The game has started. Build your city!", tone: "good" };
    case "game.ended":
      return { text: "The game is over. Great work!", tone: "info" };
    default:
      return null;
  }
}

function withArticle(name: string): string {
  return `${/^[AEIOU]/.test(name) ? "an" : "a"} ${name}`;
}

// What a teammate did, for the team feed: "built a Farm".
export function describeAction(event: LoggedEvent): string | null {
  const payload = event.payload;
  const building = (kind: BuildingKind) => BUILDINGS[kind].name;
  switch (event.type) {
    case "building.built":
      return `built ${withArticle(building((payload.building as { kind: BuildingKind }).kind))}`;
    case "building.upgraded":
      return `upgraded ${building(payload.kind as BuildingKind)} to level ${String(payload.after)}`;
    case "building.demolished":
      return `removed ${withArticle(building((payload.building as { kind: BuildingKind }).kind))}`;
    case "building.toggled":
      return payload.after ? "restarted a building" : "stopped a building";
    case "market.bought":
      return `bought ${String(payload.amount)} ${GOOD_INFO[payload.good as Good].name.toLowerCase()}`;
    case "market.sold":
      return `sold ${String(payload.amount)} ${GOOD_INFO[payload.good as Good].name.toLowerCase()}`;
    case "trade.proposed":
      return `offered a trade to ${cityInfo((payload.offer as { to: CityId }).to).name}`;
    case "trade.accepted":
      return `accepted a trade from ${cityInfo((payload.offer as { from: CityId }).from).name}`;
    case "trade.declined":
      return "said no to a trade";
    case "meeting.voted":
      return `voted ${payload.after ? "yes" : "no"} on ${POLICIES[payload.policyId as PolicyId].name}`;
    case "reflection.submitted":
      return "shared a reflection";
    case "goal.achieved":
      return `reached a goal: ${GOALS[payload.goal as GoalId].name} 🏆`;
    default:
      return null;
  }
}
