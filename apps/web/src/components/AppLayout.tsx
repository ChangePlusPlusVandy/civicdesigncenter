import { Building2 } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
    isActive && "bg-secondary text-foreground",
  );

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-bold tracking-tight"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-5" aria-hidden="true" />
            </span>
            <span>City Settlers</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <NavLink to="/join" className={navLinkClass}>
              Join game
            </NavLink>
            <NavLink to="/teach" className={navLinkClass}>
              Teach
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex flex-1">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>City Settlers · Civic Design Center</span>
          <span>Plan a city. See the tradeoffs.</span>
        </div>
      </footer>
    </div>
  );
}
