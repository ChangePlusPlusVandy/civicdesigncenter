// Teacher downloads (#48). The event log stays pseudonymous (research data);
// activity and reflections include names, since they're the teacher's own
// class records for discussion and grading.

import {
  getMap,
  type IdleState,
  type LoggedEvent,
  type RosterEntry,
} from "@cs/idle";

// The CSV downloads a teacher can ask for.
export type ExportKind = "activity" | "reflections" | "cities" | "events";
// Every CSV export, in the order the teacher page lists them.
export const EXPORT_KINDS: ExportKind[] = [
  "activity",
  "reflections",
  "cities",
  "events",
];

type Cell = string | number | boolean | null | undefined;

function csv(header: string[], rows: Cell[][]): string {
  const escape = (cell: Cell) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    // Quote anything with commas, quotes or newlines; neutralise leading
    // characters spreadsheets would run as formulas.
    const safe =
      typeof cell === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return (
    [header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n") +
    "\r\n"
  );
}

// Builds one CSV export as text: per-student activity, reflections, each
// city's stats over time with its latest season report, or the pseudonymous
// event log (EVT-008). Cells a spreadsheet would run as formulas are defused.
export function exportCsv(
  kind: ExportKind,
  state: IdleState,
  roster: RosterEntry[],
  events: LoggedEvent[],
): string {
  const map = getMap(state.mapId);
  const cityName = (id: string) =>
    map.cities.find((c) => c.id === id)?.name ?? id;
  const nameOf = (id: string | null | undefined) =>
    roster.find((player) => player.playerId === id)?.name ?? "";

  switch (kind) {
    case "activity":
      return csv(
        [
          "student",
          "city",
          "builds",
          "upgrades",
          "trades",
          "market_deals",
          "votes",
          "reflections",
        ],
        roster.map((player) => [
          player.name,
          cityName(player.cityId),
          player.contribution?.builds,
          player.contribution?.upgrades,
          player.contribution?.trades,
          player.contribution?.market,
          player.contribution?.votes,
          player.contribution?.reflections,
        ]),
      );
    case "reflections":
      return csv(
        ["season", "city", "student", "day", "answer"],
        state.reflections.map((r) => [
          r.season,
          cityName(r.cityId),
          nameOf(r.participantId),
          r.tick,
          r.text,
        ]),
      );
    case "cities": {
      const rows: Cell[][] = [];
      for (const id of state.cityIds) {
        const city = state.cities[id];
        if (!city) continue;
        for (const point of city.history) {
          rows.push([
            "sample",
            cityName(id),
            "",
            point.tick,
            point.population,
            point.happiness,
            point.pollution,
            "",
            "",
            "",
          ]);
        }
        const report = city.lastReport;
        if (report) {
          rows.push([
            "latest_season",
            cityName(id),
            report.season,
            "",
            report.after.population,
            report.after.happiness,
            report.after.pollution,
            report.after.coins,
            report.commons.river.after,
            Math.round(
              (report.commons.westWoods.after +
                report.commons.eastWoods.after) /
                2,
            ),
          ]);
        }
      }
      return csv(
        [
          "row",
          "city",
          "season",
          "day",
          "people",
          "happiness",
          "pollution",
          "coins",
          "river_health",
          "woods_health",
        ],
        rows,
      );
    }
    case "events":
      return csv(
        [
          "seq",
          "day",
          "time",
          "actor",
          "participant_id",
          "city",
          "type",
          "outcome",
          "error_code",
          "payload",
        ],
        events.map((e) => [
          e.seq,
          e.tick,
          new Date(e.at).toISOString(),
          e.actor,
          e.participantId,
          e.city ? cityName(e.city) : "",
          e.type,
          e.outcome,
          e.errorCode,
          JSON.stringify(e.payload),
        ]),
      );
  }
}
