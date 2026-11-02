import { useState } from "react";
import { cn } from "@/lib/utils";
import { buildDemoWorld } from "./demoWorld";
import { WebGLBoundary } from "./WebGLBoundary";
import { WorldCanvas } from "./WorldCanvas";

const DEMO = buildDemoWorld();

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
          cities={DEMO.cities}
          commons={DEMO.commons}
          tick={DEMO.tick}
          onReady={() => setReady(true)}
        />
      </div>
    </WebGLBoundary>
  );
}
