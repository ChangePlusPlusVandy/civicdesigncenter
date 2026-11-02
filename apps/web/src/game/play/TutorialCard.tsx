import type { PrivateCity, Projection } from "@cs/idle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdvisorTab } from "../advisor";
import { panel } from "../format";
import type { TutorialStep } from "../tutorial";

export function TutorialCard({
  step,
  number,
  total,
  state,
  city,
  tab,
  onNext,
  onSkip,
}: {
  step: TutorialStep;
  number: number;
  total: number;
  state: Projection;
  city: PrivateCity;
  tab: AdvisorTab;
  onNext: () => void;
  onSkip: () => void;
}) {
  const ctx = { state, city, tab };
  const action = Boolean(step.done);
  const waiting = action && state.phase !== "running";
  return (
    <section
      className={cn(
        panel,
        "pointer-events-auto w-[22rem] max-w-full border-primary/50 p-4",
      )}
      aria-label="Tutorial"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
          First day · step {number} of {total}
        </p>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Skip tutorial
        </button>
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-secondary"
        aria-hidden="true"
      >
        <div
          className="h-full bg-primary transition-[width] duration-500"
          style={{ width: `${(number / total) * 100}%` }}
        />
      </div>
      <h2 className="mt-3 font-serif text-xl tracking-tight">
        {step.title(ctx)}
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        {step.body(ctx)}
      </p>
      <div className="mt-3">
        {!action ? (
          <Button className="h-9" onClick={onNext}>
            {number === total ? "Start playing!" : "Next"}
          </Button>
        ) : waiting ? (
          <p className="text-sm font-semibold text-[var(--orange)]">
            Try it as soon as your teacher starts the game.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <span
              className="size-2 animate-pulse rounded-full bg-primary"
              aria-hidden="true"
            />
            Your turn: give it a try!
          </p>
        )}
      </div>
    </section>
  );
}
