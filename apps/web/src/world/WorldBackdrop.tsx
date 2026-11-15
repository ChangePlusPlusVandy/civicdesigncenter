import { useState } from "react";
import { cn } from "@/lib/utils";
import { buildDemoWorld } from "./demoWorld";
import { WebGLBoundary } from "./WebGLBoundary";
import { WorldCanvas } from "./WorldCanvas";

// Nashville is the first city this game is built for.
const DEMO = buildDemoWorld("nashville");

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
          mapId={DEMO.mapId}
          cities={DEMO.cities}
          commons={DEMO.commons}
          tick={DEMO.tick}
          onReady={() => setReady(true)}
        />
      </div>
    </WebGLBoundary>
  );
}
