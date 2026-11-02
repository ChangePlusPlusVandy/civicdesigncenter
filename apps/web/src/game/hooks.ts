import { useCallback, useEffect, useRef, useState } from "react";
import type { Toast } from "./format";

// Counts smoothly toward `value` so ticking numbers feel alive.
export function useTween(value: number, duration = 600): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const next = origin + (value - origin) * (1 - (1 - t) ** 3);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++next.current;
    setToasts((current) => [...current.slice(-2), { id, text, tone }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((t) => t.id !== id)),
      5000,
    );
  }, []);
  return { toasts, push };
}
