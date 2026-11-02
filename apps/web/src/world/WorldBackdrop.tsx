import { Component, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { createDemoBuildings } from "./map";
import { WorldCanvas } from "./WorldCanvas";

const BACKDROP_BUILDINGS = createDemoBuildings();
const BACKDROP_POLLUTION = { red: 5, green: 3, pink: 8, blue: 4, yellow: 2 };

// No WebGL (old device, blocked GPU): render nothing and keep the page usable.
export class WebGLBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? (this.props.fallback ?? null)
      : this.props.children;
  }
}

export function WorldBackdrop({ className }: { className?: string }) {
  const [ready, setReady] = useState(false);

  return (
    <WebGLBoundary>
      <div
        aria-hidden="true"
        className={cn(
          "transition-opacity duration-1000",
          ready ? "opacity-100" : "opacity-0",
          className,
        )}
      >
        <WorldCanvas
          mode="backdrop"
          buildings={BACKDROP_BUILDINGS}
          pollution={BACKDROP_POLLUTION}
          onReady={() => setReady(true)}
        />
      </div>
    </WebGLBoundary>
  );
}
