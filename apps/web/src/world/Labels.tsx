// HTML labels pinned to 3D positions: building badges and "+1 🌾" popups.
// They're ordinary React elements in an overlay; one tracker inside the
// canvas moves them to their building's screen position every frame. (drei's
// <Html> mounts a separate React root per label, which never rendered here.)

import type { ReactNode, RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import {
  BUILDINGS,
  GOOD_INFO,
  type Building,
  type BuildingStatus,
  type Good,
} from "@cs/idle";

export interface Label {
  id: string;
  position: [number, number, number];
  node: ReactNode;
}

const STATUS_LABELS: Partial<Record<BuildingStatus, string>> = {
  "no-workers": "Needs workers",
  "commons-empty": "Nothing left to take",
};

export function Badge({ building }: { building: Building }) {
  const def = BUILDINGS[building.kind];
  const problem = building.running ? STATUS_LABELS[building.status] : undefined;
  return (
    <div className="flex flex-col items-center gap-0.5 whitespace-nowrap">
      <span className="flex items-center gap-1 rounded-full bg-white/90 px-1.5 py-0.5 text-xs font-bold text-foreground shadow">
        <span aria-hidden="true">{def.icon}</span>
        {building.kind !== "hall" ? (
          <span className="tracking-tighter text-[var(--orange)]">
            {"★".repeat(building.level)}
          </span>
        ) : null}
      </span>
      {problem ? (
        <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
          {problem}
        </span>
      ) : null}
    </div>
  );
}

export function Popup({ building }: { building: Building }) {
  const gains = (
    Object.entries(building.lastOutput) as [Good, number][]
  ).filter(([, amount]) => amount > 0);
  return (
    <span className="animate-float-up block whitespace-nowrap text-sm font-black text-white [text-shadow:0_1px_3px_rgb(0_0_0/60%)]">
      {gains
        .map(
          ([good, amount]) =>
            `+${Math.round(amount * 10) / 10} ${GOOD_INFO[good].icon}`,
        )
        .join(" ")}
    </span>
  );
}

const projected = new Vector3();

// Inside the canvas: moves each label element to its point on screen.
export function LabelTracker({
  labels,
  elements,
}: {
  labels: Label[];
  elements: RefObject<Map<string, HTMLElement>>;
}) {
  useFrame(({ camera, size }) => {
    for (const label of labels) {
      const element = elements.current.get(label.id);
      if (!element) continue;
      projected.set(...label.position).project(camera);
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height;
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

// Outside the canvas: the label elements themselves.
export function LabelLayer({
  labels,
  elements,
}: {
  labels: Label[];
  elements: RefObject<Map<string, HTMLElement>>;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {labels.map((label) => (
        <div
          key={label.id}
          ref={(element) => {
            if (element) elements.current.set(label.id, element);
            else elements.current.delete(label.id);
          }}
          className="absolute left-0 top-0 will-change-transform"
          style={{ transform: "translate(-9999px, 0)" }}
        >
          {label.node}
        </div>
      ))}
    </div>
  );
}
