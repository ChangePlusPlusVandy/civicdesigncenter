import type { ReactNode } from "react";
import type { Bundle, Good } from "@cs/idle";
import { cn } from "@/lib/utils";
import { bundleIcon, type Toast } from "./format";
import { useTween } from "./hooks";

// One counter in the city strip: the icon and the number read first, the
// word under it so nobody has to guess what 🪵 means, and the change per day.
export function Stat({
  icon,
  label,
  value,
  rate,
  max,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  rate?: number;
  max?: number;
  tone?: "warn";
}) {
  const shown = useTween(value);
  const moving = rate !== undefined && Math.abs(rate) >= 0.05;
  return (
    <div className="flex min-w-14 flex-col" title={label}>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="text-base leading-none">
          {icon}
        </span>
        <span
          className={cn(
            "text-lg font-semibold leading-6 tabular-nums",
            tone === "warn" && "text-destructive",
          )}
        >
          {Math.floor(shown)}
          {max !== undefined ? (
            <span className="text-sm font-medium text-muted-foreground">
              /{max}
            </span>
          ) : null}
        </span>
      </span>
      <span className="text-xs leading-4 text-muted-foreground">
        {label}
        {moving ? (
          <span
            className={cn(
              "ml-1 font-semibold tabular-nums",
              rate > 0 ? "text-positive" : "text-destructive",
            )}
          >
            {rate > 0 ? "+" : ""}
            {Math.round(rate * 10) / 10}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function CostChips({
  cost,
  have,
}: {
  cost: Bundle;
  have?: { coins: number; goods: Record<Good, number> };
}) {
  const entries = Object.entries(cost).filter(([, amount]) => amount);
  if (!entries.length)
    return <span className="text-xs text-muted-foreground">Free</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([key, amount]) => {
        const owned = have
          ? key === "coins"
            ? have.coins
            : have.goods[key as Good]
          : Infinity;
        const short = owned < (amount ?? 0);
        return (
          <span
            key={key}
            className={cn(
              "rounded-lg px-1.5 py-0.5 text-xs font-semibold tabular-nums",
              short ? "bg-destructive/10 text-destructive" : "bg-secondary",
            )}
          >
            {bundleIcon(key)} {amount}
          </span>
        );
      })}
    </span>
  );
}

export function Meter({
  value,
  tone = "primary",
  label,
}: {
  value: number;
  tone?: "primary" | "warn";
  label: string;
}) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-secondary"
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700",
          tone === "warn" || value < 30
            ? "bg-destructive"
            : value < 60
              ? "bg-warn"
              : "bg-primary",
        )}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

// Messages rise from the bottom of the area they belong to, clear of the
// city strip at the top. `className` places that area.
export function Toasts({
  toasts,
  className = "inset-x-0",
}: {
  toasts: Toast[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-28 z-50 flex flex-col items-center gap-2 px-4",
        className,
      )}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <p
          key={toast.id}
          role="status"
          className={cn(
            "animate-toast-in max-w-md rounded-full px-4 py-2 text-center text-sm font-semibold shadow-[0_4px_16px_rgb(22_36_27/0.16)]",
            toast.tone === "good" && "bg-primary text-primary-foreground",
            toast.tone === "bad" && "bg-destructive text-white",
            toast.tone === "info" &&
              "bg-card text-foreground ring-1 ring-border",
          )}
        >
          {toast.text}
        </p>
      ))}
    </div>
  );
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// A tiny trend line with the latest value, for the City tab and projector.
export function Sparkline({
  label,
  values,
  suffix = "",
  goodWhen = "up",
}: {
  label: string;
  values: number[];
  suffix?: string;
  goodWhen?: "up" | "down";
}) {
  const latest = values.at(-1);
  if (latest === undefined || values.length < 2) {
    return (
      <div className="rounded-xl bg-secondary p-2.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">Collecting data…</p>
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map(
      (value, i) =>
        `${(i / (values.length - 1)) * 100},${28 - ((value - min) / span) * 24}`,
    )
    .join(" ");
  const change = latest - (values[0] ?? latest);
  const better = goodWhen === "up" ? change > 0 : change < 0;
  return (
    <figure className="rounded-xl bg-secondary p-2.5">
      <figcaption className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {Math.round(latest * 10) / 10}
          {suffix}
          {change ? (
            <span
              className={cn(
                "ml-1 text-xs",
                better ? "text-positive" : "text-destructive",
              )}
            >
              {change > 0 ? "▲" : "▼"}
            </span>
          ) : null}
        </span>
      </figcaption>
      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        className="mt-1 h-8 w-full"
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke={better || !change ? "var(--primary)" : "var(--destructive)"}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
    </figure>
  );
}
