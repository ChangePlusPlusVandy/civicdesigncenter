import { useState } from "react";
import { Check, Circle, X } from "lucide-react";
import type { Projection } from "@cs/idle";
import { cn } from "@/lib/utils";
import { surface } from "../format";

// The teacher's run-of-show. Steps tick themselves off as the class plays.
export function QuickStart({
  state,
  joinUrl,
}: {
  state: Projection;
  joinUrl: string;
}) {
  const [hidden, setHidden] = useState(false);
  const students = state.roster?.length ?? 0;
  const steps = [
    {
      done: false,
      text: "Open the projector view on the classroom screen (Projector button above).",
      optional: true,
    },
    {
      done: students > 0,
      text: `Students go to ${joinUrl.replace(/^https?:\/\//, "")} and type their name. ${students ? `${students} joined so far.` : ""}`,
    },
    {
      done: state.phase !== "lobby",
      text: "When everyone's in, press Start game. Each student gets a short hands-on tutorial.",
    },
    {
      done: state.meetingResults.length > 0 || state.meeting !== null,
      text: "After 5 to 10 minutes, pick 1 to 3 rules and call a Town Meeting. Give teams time to talk before they vote.",
    },
    {
      done: state.meetingResults.length > 0,
      text: "Close the vote to end the season. Students see a report card and a reflection question.",
    },
    {
      done: state.reflections.length > 0,
      text: "Read the reflections below and discuss: who used the river most? Was it fair?",
    },
  ];
  if (hidden) return null;
  return (
    <section className={cn(surface, "p-4")} aria-label="How to run a game">
      <div className="flex items-start justify-between">
        <h2 className="font-semibold">How to run a game</h2>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Hide the guide"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ol className="mt-2 space-y-2 text-sm">
        {steps.map((step, i) => (
          <li
            key={i}
            className={cn("flex gap-2", step.done && "text-muted-foreground")}
          >
            {step.done ? (
              <Check
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-label="Done"
              />
            ) : (
              <Circle
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-label={step.optional ? "Optional" : "To do"}
              />
            )}
            <span
              className={cn(
                step.done && "line-through decoration-muted-foreground/40",
              )}
            >
              {step.text}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Tip: Pause anytime to talk as a class. Surprise events (drought,
        festival, flood) make good discussion starters.
      </p>
    </section>
  );
}
