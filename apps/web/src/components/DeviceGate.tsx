import { useEffect, useState, type ReactNode } from "react";
import { Laptop, Tablet } from "lucide-react";

// Phones are about 360–430 CSS px on their short side; the smallest iPad
// (mini) is 744. Checking the screen, not the user agent, is what works:
// iPad Safari reports itself as a Mac. A small window on a laptop still
// passes, since the screen is big.
export const MIN_SHORT_SIDE = 600;

function isTooSmall(): boolean {
  return Math.min(window.screen.width, window.screen.height) < MIN_SHORT_SIDE;
}

export function DeviceGate({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(isTooSmall);

  useEffect(() => {
    const check = () => setBlocked(isTooSmall());
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  if (!blocked) return children;

  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-center"
      data-testid="device-gate"
    >
      <div className="max-w-sm">
        <div
          className="mx-auto flex w-fit gap-3 text-primary"
          aria-hidden="true"
        >
          <Tablet className="size-10" />
          <Laptop className="size-10" />
        </div>
        <h1 className="mt-6 font-serif text-3xl tracking-tight">
          City Settlers needs a bigger screen
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Please use an iPad, a Chromebook or a computer. Phones are too small
          to see your whole city.
        </p>
      </div>
    </main>
  );
}
