import {
  COMMONS_NAMES,
  EVENTS,
  GOALS,
  GOOD_INFO,
  POLICIES,
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
