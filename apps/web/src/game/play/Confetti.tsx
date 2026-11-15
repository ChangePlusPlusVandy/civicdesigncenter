import { useMemo } from "react";

const COLORS = [
  "#e0bf4f",
  "#3f9a5a",
  "#d9574a",
  "#4b76d1",
  "#dc6aa9",
  "#cc704a",
];

// A burst of confetti. Re-key it (for example with a counter) to fire again.
// Hidden for people who asked for reduced motion.
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        color: COLORS[i % COLORS.length],
        delay: `${(i % 9) * 60}ms`,
        duration: `${1.4 + ((i * 13) % 10) / 10}s`,
        drift: `${((i * 53) % 120) - 60}px`,
        spin: `${((i * 97) % 720) - 360}deg`,
        size: 6 + (i % 4) * 2,
      })),
    [],
  );
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden motion-reduce:hidden"
      aria-hidden="true"
    >
      {pieces.map((piece, i) => (
        <span
          key={i}
          className="animate-confetti absolute top-0 block rounded-sm"
          style={
            {
              left: piece.left,
              width: piece.size,
              height: piece.size * 0.5,
              background: piece.color,
              animationDelay: piece.delay,
              "--duration": piece.duration,
              "--drift": piece.drift,
              "--spin": piece.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
