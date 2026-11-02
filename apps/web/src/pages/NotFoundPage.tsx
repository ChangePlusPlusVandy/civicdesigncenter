import { ArrowLeft, MonitorUp, School, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl items-center px-5 py-16 sm:px-8">
      <div className="max-w-lg">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--orange)]">
          404
        </p>
        <h1 className="mt-4 font-serif text-5xl tracking-[-0.05em]">
          That road is not on the map.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Return home and choose a player or teacher route.
        </p>
        <Button asChild className="mt-7" variant="outline">
          <Link to="/">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back home
          </Link>
        </Button>
      </div>
      <div
        className="ml-auto hidden gap-3 text-primary/35 lg:flex"
        aria-hidden="true"
      >
        <UsersRound className="size-16" />
        <School className="size-16" />
        <MonitorUp className="size-16" />
      </div>
    </div>
  );
}
