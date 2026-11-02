import { createContext, useEffect, useState } from "react";
import { MAP_HEIGHT, MAP_WIDTH } from "./map";

// Grid cell (x, y) -> world (x, z). The map is centered on the origin and the
// top of every land tile sits at y = 0.
export function toWorld(x: number, y: number): [number, number] {
  return [x - (MAP_WIDTH - 1) / 2, y - (MAP_HEIGHT - 1) / 2];
}

// False when the viewer asked for reduced motion: the world renders, but
// nothing drifts, walks or puffs.
export const MotionContext = createContext(true);

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia(REDUCED_MOTION).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
