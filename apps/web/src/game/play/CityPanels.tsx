import { useState, type FormEvent } from "react";
import {
  COMMONS_NAMES,
  GOALS,
  POLICIES,
  REFLECTION_MAX_LENGTH,
  REFLECTION_PROMPTS,
  type CommonsId,
  type Contribution,
  type GoalId,
  type LoggedEvent,
  type PrivateCity,
  type Projection,
  type SeasonReport,
} from "@cs/idle";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COIN, describeAction, happinessFace, panel } from "../format";
import { Meter, Section, Sparkline } from "../ui";
import type { Run } from "./BuildPanel";

const CONTRIBUTION_LABELS: [keyof Contribution, string, string][] = [
  ["builds", "🏗️", "built"],
  ["upgrades", "⭐", "upgraded"],
  ["trades", "🤝", "traded"],
  ["market", "🛒", "used the market"],
  ["votes", "🗳️", "voted"],
  ["reflections", "💭", "reflected"],
];

export function ContributionChips({
  contribution,
}: {
  contribution?: Contribution;
}) {
  const done = CONTRIBUTION_LABELS.filter(
    ([key]) => (contribution?.[key] ?? 0) > 0,
  );
  if (!done.length)
    return (
      <span className="text-xs text-muted-foreground">
        Just getting started
      </span>
    );
  return (
    <span className="flex flex-wrap gap-1">
      {done.map(([key, icon, verb]) => (
        <span
          key={key}
          className="rounded bg-secondary px-1.5 text-xs tabular-nums"
          title={`${verb} ${contribution?.[key]}×`}
        >
          {icon} {contribution?.[key]}
        </span>
      ))}
    </span>
  );
}

function TeamSection({
  game,
  events,
}: {
  game: Projection;
  events: LoggedEvent[];
}) {
  const team = game.team ?? [];
  const feed = events
    .filter(
      (e) =>
        e.outcome === "accepted" && e.actorName && e.city === game.me?.cityId,
    )
    .map((e) => ({ event: e, text: describeAction(e) }))
    .filter(
      (row): row is { event: LoggedEvent; text: string } => row.text !== null,
    )
    .slice(-8)
    .reverse();
  return (
    <Section title={`Your team (${team.length})`}>
      <ul className="space-y-1.5 text-sm">
        {team.map((member) => (
          <li
            key={member.playerId}
            className="flex items-center justify-between gap-2"
          >
            <span
              className={cn(
                "font-semibold",
                member.playerId === game.me?.playerId && "text-primary",
              )}
            >
              {member.name}
              {member.playerId === game.me?.playerId ? " (you)" : ""}
            </span>
            <ContributionChips contribution={member.contribution} />
          </li>
        ))}
      </ul>
      {feed.length ? (
        <ol
          className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground"
          aria-label="Recent team activity"
        >
          {feed.map(({ event, text }) => (
            <li key={event.seq}>
              <span className="font-semibold text-foreground">
                {event.actorName}
              </span>{" "}
              {text}
              <span className="ml-1">· day {event.tick}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Decide together what to build first!
        </p>
      )}
    </Section>
  );
}

function Trends({ game, city }: { game: Projection; city: PrivateCity }) {
  return (
    <Section title="How things are changing">
      <div className="grid grid-cols-2 gap-2">
        <Sparkline
          label="People"
          values={city.history.map((h) => h.population)}
        />
        <Sparkline
          label="Happiness"
          values={city.history.map((h) => h.happiness)}
        />
        <Sparkline
          label="Pollution"
          values={city.history.map((h) => h.pollution)}
          goodWhen="down"
        />
        <Sparkline
          label="Region health"
          values={game.regionHistory.map((h) => h.health)}
          suffix="%"
        />
      </div>
    </Section>
  );
}

export function Leaderboards({
  game,
  highlight,
}: {
  game: Projection;
  highlight?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {game.leaderboards.map((board) => (
        <div key={board.id} className="rounded-lg border p-2">
          <h4 className="text-xs font-bold text-muted-foreground">
            {board.title}
          </h4>
          <ol className="mt-1 space-y-0.5 text-sm">
            {board.ranking.slice(0, 3).map((row, i) => {
              const city = game.cities.find((c) => c.id === row.cityId);
              return (
                <li
                  key={row.cityId}
                  className={cn(
                    "flex items-center gap-1.5",
                    row.cityId === highlight && "font-bold",
                  )}
                >
                  <span className="w-3 text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  <span
                    className="size-2 rounded-full"
                    style={{ background: city?.color }}
                  />
                  <span className="truncate">
                    {city?.name.replace(" City", "")}
                  </span>
                  <span className="ml-auto tabular-nums">{row.value}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function NatureHealth({ game }: { game: Projection }) {
  return (
    <div className="space-y-2">
      <div>
        <div className="flex justify-between text-sm font-semibold">
          <span>Region health</span>
          <span className="tabular-nums">{game.regionHealth}%</span>
        </div>
        <Meter value={game.regionHealth} label="Region health" />
      </div>
      {game.commons.map((commons) => (
        <div key={commons.id}>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {commons.name}
              {commons.collapsed ? " · used up!" : ""}
            </span>
            <span className="tabular-nums">{commons.health}%</span>
          </div>
          <Meter value={commons.health} label={`${commons.name} health`} />
        </div>
      ))}
    </div>
  );
}

export function CityPanel({
  game,
  city,
  events,
}: {
  game: Projection;
  city: PrivateCity;
  events: LoggedEvent[];
}) {
  const total = city.happinessFactors.reduce((sum, f) => sum + f.value, 0);
  return (
    <div className="space-y-5">
      <TeamSection game={game} events={events} />

      <Section title={`Why people feel ${happinessFace(city.happiness)}`}>
        <ul className="space-y-1 text-sm">
          {city.happinessFactors.map((factor) => (
            <li key={factor.label} className="flex justify-between">
              <span>{factor.label}</span>
              <span
                className={cn(
                  "font-bold tabular-nums",
                  factor.value < 0
                    ? "text-destructive"
                    : factor.label === "Base"
                      ? ""
                      : "text-primary",
                )}
              >
                {factor.value > 0 && factor.label !== "Base" ? "+" : ""}
                {factor.value}
              </span>
            </li>
          ))}
          <li className="flex justify-between border-t pt-1 font-bold">
            <span>Happiness is heading to</span>
            <span className="tabular-nums">
              {Math.min(Math.max(total, 0), 100)}
            </span>
          </li>
        </ul>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Happy people pay more taxes, and people only move in when happiness is
          40 or more and there are free homes.
        </p>
      </Section>

      <Trends game={game} city={city} />

      <Section title="Nature we share">
        <NatureHealth game={game} />
      </Section>

      <Section
        title={`Goals (${city.goals.length}/${Object.keys(GOALS).length})`}
      >
        <ul className="space-y-1 text-sm">
          {(Object.keys(GOALS) as GoalId[]).map((goal) => {
            const done = city.goals.includes(goal);
            return (
              <li
                key={goal}
                className={cn(
                  "flex items-start gap-2",
                  done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {done ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-label="Done"
                  />
                ) : (
                  <Circle
                    className="mt-0.5 size-4 shrink-0"
                    aria-label="Not yet"
                  />
                )}
                <span>
                  <span className="font-semibold">{GOALS[goal].name}</span> ·{" "}
                  {GOALS[goal].hint}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Leaderboards">
        <Leaderboards game={game} highlight={city.id} />
      </Section>

      {game.policies.length ? (
        <Section title="Rules everyone voted for">
          <ul className="space-y-1 text-sm">
            {game.policies.map((id) => (
              <li key={id}>
                <span className="font-semibold">{POLICIES[id].name}:</span>{" "}
                {POLICIES[id].summary}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

export function MeetingModal({
  game,
  city,
  run,
}: {
  game: Projection;
  city: PrivateCity;
  run: Run;
}) {
  const meeting = game.meeting;
  if (!meeting) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/30 p-4">
      <section
        className={cn(panel, "max-h-[90dvh] w-full max-w-xl overflow-auto p-6")}
        aria-labelledby="meeting-title"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Season {game.season} · Town Meeting
        </p>
        <h2
          id="meeting-title"
          className="mt-2 font-serif text-3xl tracking-tight"
        >
          🏛️ Time to vote
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Talk it over with your team. Each city gets one vote per rule. A rule
          passes if more cities vote yes than no, and it changes the game for
          everyone.
        </p>
        <ul className="mt-5 space-y-3">
          {meeting.policyIds.map((id) => {
            const vote = meeting.myVotes?.[id];
            return (
              <li key={id} className="rounded-lg border p-3">
                <h3 className="font-bold">{POLICIES[id].name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {POLICIES[id].summary}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant={vote === true ? "default" : "outline"}
                    aria-pressed={vote === true}
                    onClick={() =>
                      run({
                        type: "vote",
                        payload: { policyId: id, yes: true },
                      })
                    }
                  >
                    👍 Yes
                  </Button>
                  <Button
                    variant={vote === false ? "default" : "outline"}
                    aria-pressed={vote === false}
                    onClick={() =>
                      run({
                        type: "vote",
                        payload: { policyId: id, yes: false },
                      })
                    }
                  >
                    👎 No
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm">
          <span className="font-semibold">Cities that voted:</span>{" "}
          {meeting.votedCities.length
            ? meeting.votedCities
                .map((id) => game.cities.find((c) => c.id === id)?.name)
                .join(", ")
            : "none yet"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          You can change your team's vote until your teacher closes the meeting.
          Your city: {city.name}.
        </p>
      </section>
    </div>
  );
}

function Change({
  label,
  before,
  after,
  good = "up",
}: {
  label: string;
  before: number;
  after: number;
  good?: "up" | "down";
}) {
  const diff = after - before;
  const better = good === "up" ? diff > 0 : diff < 0;
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">
        {before} → {after}
      </p>
      {diff ? (
        <p
          className={cn(
            "text-xs font-bold",
            better ? "text-primary" : "text-destructive",
          )}
        >
          {diff > 0 ? "+" : ""}
          {diff}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">no change</p>
      )}
    </div>
  );
}

// The civic part of a season: one question to think about, answered in a
// sentence or two. The teacher sees every answer; teammates see each other's.
function Reflection({
  report,
  game,
  run,
}: {
  report: SeasonReport;
  game: Projection;
  run: Run;
}) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const prompt =
    REFLECTION_PROMPTS[(report.season - 1) % REFLECTION_PROMPTS.length];
  const teamAnswers = game.reflections.filter(
    (r) => r.season === report.season,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      await run(
        { type: "reflect", payload: { season: report.season, text } },
        "Thanks for sharing! 💭",
      )
    ) {
      setSent(true);
    }
  }

  return (
    <section className="mt-5 rounded-lg border p-3">
      <h3 className="text-sm font-bold">💭 Think about it</h3>
      <p className="mt-1 text-sm">{prompt}</p>
      {sent ? null : (
        <form onSubmit={submit} className="mt-2 space-y-2">
          <label htmlFor="reflection" className="sr-only">
            Your answer
          </label>
          <textarea
            id="reflection"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={REFLECTION_MAX_LENGTH}
            rows={3}
            placeholder="Write a sentence or two. Don't include anyone's real name."
            className="w-full resize-none rounded-md border bg-background p-2 text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            className="h-8 text-xs"
            disabled={!text.trim()}
          >
            Share with my teacher
          </Button>
        </form>
      )}
      {teamAnswers.length ? (
        <ul className="mt-3 space-y-1 border-t pt-2 text-sm">
          {teamAnswers.map((answer) => (
            <li key={answer.id}>
              <span className="font-semibold">
                {answer.author ?? "A teammate"}:
              </span>{" "}
              {answer.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function SeasonReportModal({
  report,
  game,
  run,
  onClose,
}: {
  report: SeasonReport;
  game: Projection;
  run: Run;
  onClose: () => void;
}) {
  const result = game.meetingResults.find((r) => r.season === report.season);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/30 p-4">
      <section
        className={cn(panel, "max-h-[90dvh] w-full max-w-xl overflow-auto p-6")}
        aria-labelledby="report-title"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Season {report.season} report
        </p>
        <h2
          id="report-title"
          className="mt-2 font-serif text-3xl tracking-tight"
        >
          How did your city do?
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Change
            label="People"
            before={report.before.population}
            after={report.after.population}
          />
          <Change
            label={`Coins ${COIN}`}
            before={report.before.coins}
            after={report.after.coins}
          />
          <Change
            label="Happiness"
            before={report.before.happiness}
            after={report.after.happiness}
          />
          <Change
            label="Pollution"
            before={report.before.pollution}
            after={report.after.pollution}
            good="down"
          />
        </div>
        <h3 className="mt-5 text-sm font-bold">Nature everyone shares</h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(Object.keys(report.commons) as CommonsId[]).map((id) => (
            <Change
              key={id}
              label={`${COMMONS_NAMES[id]} %`}
              before={report.commons[id].before}
              after={report.commons[id].after}
            />
          ))}
        </div>
        {result ? (
          <p className="mt-4 text-sm">
            <span className="font-semibold">Town Meeting:</span>{" "}
            {result.passed.length
              ? `passed ${result.passed.map((id) => POLICIES[id].name).join(", ")}`
              : "no rules passed"}
            {result.failed.length
              ? `; voted down ${result.failed.map((id) => POLICIES[id].name).join(", ")}`
              : ""}
            .
          </p>
        ) : null}
        <Reflection report={report} game={game} run={run} />
        <Button className="mt-6 w-full" onClick={onClose}>
          On to season {report.season + 1}!
        </Button>
      </section>
    </div>
  );
}

export function PhaseOverlay({
  game,
  city,
}: {
  game: Projection;
  city: PrivateCity;
}) {
  if (game.phase === "running" || game.phase === "meeting") return null;
  const teammates = city.players.filter((name) => name !== game.me?.name);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center px-4">
      <div
        className={cn(panel, "pointer-events-auto max-w-md p-6 text-center")}
        role="status"
      >
        {game.phase === "lobby" ? (
          <>
            <p className="text-4xl" aria-hidden="true">
              🏗️
            </p>
            <h2 className="mt-2 font-serif text-2xl tracking-tight">
              You're on {city.name}!
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {teammates.length ? `Your team: ${teammates.join(", ")}. ` : ""}
              Look around your land while you wait for your teacher to start.
            </p>
          </>
        ) : game.phase === "paused" ? (
          <>
            <p className="text-4xl" aria-hidden="true">
              👀
            </p>
            <h2 className="mt-2 font-serif text-2xl tracking-tight">Paused</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Eyes on your teacher.
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl" aria-hidden="true">
              🎉
            </p>
            <h2 className="mt-2 font-serif text-2xl tracking-tight">
              Game over!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {city.name} finished with {city.population} people and{" "}
              {Math.round(city.happiness)} happiness.
            </p>
            <div className="mt-4 text-left">
              <Leaderboards game={game} highlight={city.id} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
