import { useState } from "react";
import { Lightbulb, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Tip } from "../advisor";
import { panel } from "../format";

// The one most useful thing to do next, plus any other problems as chips.
export function AdvisorCard({
  tips,
  onAction,
}: {
  tips: Tip[];
  onAction: (tip: Tip) => void;
}) {
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const visible = tips.filter(
    (tip) => tip.tone === "warn" || !skipped.has(tip.id),
  );
  const [top, ...rest] = visible;
  if (!top) return null;
  const otherWarnings = rest.filter((tip) => tip.tone === "warn").slice(0, 2);
  const warn = top.tone === "warn";

  return (
    <section
      className={cn(
        panel,
        "pointer-events-auto w-[22rem] max-w-full p-3",
        warn && "border-destructive/40",
      )}
      aria-label="Advisor"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full",
            warn
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
          )}
          aria-hidden="true"
        >
          {warn ? (
            <TriangleAlert className="size-4" />
          ) : (
            <Lightbulb className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {warn ? "Needs attention" : "Next idea"}
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-5">
            <span aria-hidden="true">{top.icon} </span>
            {top.text}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {top.action ? (
              <Button
                className="h-8 px-3 text-xs"
                onClick={() => onAction(top)}
              >
                {top.action.label}
              </Button>
            ) : null}
            {!warn ? (
              <Button
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() =>
                  setSkipped((current) => new Set(current).add(top.id))
                }
              >
                Got it
              </Button>
            ) : null}
          </div>
        </div>
        {!warn ? (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Hide this idea"
            onClick={() =>
              setSkipped((current) => new Set(current).add(top.id))
            }
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {otherWarnings.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
          {otherWarnings.map((tip) => (
            <li key={tip.id}>
              <button
                type="button"
                onClick={() => onAction(tip)}
                className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive hover:bg-destructive/15"
                title={tip.text}
              >
                {tip.icon} {tip.text.split(/[.!]/)[0]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
