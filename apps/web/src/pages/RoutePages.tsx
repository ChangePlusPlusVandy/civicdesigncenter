import { ArrowLeft, MonitorUp, School, UsersRound } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { normalizeRoomCode } from "@/lib/room-code";

interface RoutePageProps {
  eyebrow: string;
  title: string;
  description: string;
  detail?: string;
}

function RoutePage({ eyebrow, title, description, detail }: RoutePageProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="max-w-2xl rounded-xl border bg-card p-7 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-4 font-serif text-4xl tracking-[-0.045em] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          {description}
        </p>
        {detail ? (
          <p className="mt-5 rounded-md bg-secondary px-4 py-3 text-sm font-semibold">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function InvalidRoomCodePage() {
  return (
    <RoutePage
      eyebrow="Invalid room code"
      title="Check the room code and try again."
      description="Room codes must be 4–8 letters or numbers. Return to the join page to enter a valid code."
    />
  );
}

export function PlayerPage() {
  const { code } = useParams();
  const roomCode = normalizeRoomCode(code);
  const [searchParams] = useSearchParams();
  const username = searchParams.get("username")?.trim();

  if (!roomCode) {
    return <InvalidRoomCodePage />;
  }

  return (
    <RoutePage
      eyebrow="Player view"
      title={username ? `Welcome, ${username}.` : "Player view ready."}
      description="This route is ready for the player controls and state projection in the next gameplay work."
      detail={`Room ${roomCode}`}
    />
  );
}

export function CityPage() {
  const { code } = useParams();
  const roomCode = normalizeRoomCode(code);

  if (!roomCode) {
    return <InvalidRoomCodePage />;
  }

  return (
    <RoutePage
      eyebrow="Team city view"
      title="City view ready."
      description="Team-level map, resources, and city status will render here."
      detail={`Room ${roomCode}`}
    />
  );
}

export function ProjectorPage() {
  const { code } = useParams();
  const roomCode = normalizeRoomCode(code);

  if (!roomCode) {
    return <InvalidRoomCodePage />;
  }

  return (
    <RoutePage
      eyebrow="Projector view"
      title="Whole-room display ready."
      description="The shared classroom projection will use this route for public game state."
      detail={`Room ${roomCode}`}
    />
  );
}

export function TeachPage() {
  return (
    <RoutePage
      eyebrow="Teacher console"
      title="Facilitation starts here."
      description="Teacher sign-in, game creation, and active-game controls will build on this route."
    />
  );
}

export function TeachGamePage() {
  const { gameId } = useParams();
  return (
    <RoutePage
      eyebrow="Active teacher game"
      title="Game controls ready."
      description="Round controls, team management, and facilitator tools will render here."
      detail={`Game ${gameId ?? "—"}`}
    />
  );
}

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
