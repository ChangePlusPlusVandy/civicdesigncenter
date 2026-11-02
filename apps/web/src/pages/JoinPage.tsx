import { lazy, Suspense, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { normalizeRoomCode } from "@cs/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinGame } from "@/game/api";
import { saveSession } from "@/game/session";

// three.js is large; load it after the form so joining is never blocked on it.
const WorldBackdrop = lazy(() =>
  import("@/world/WorldBackdrop").then((module) => ({
    default: module.WorldBackdrop,
  })),
);

export function JoinPage() {
  const navigate = useNavigate();
  // Teachers can share /join?code=ABCDE so students only type a name.
  const [params] = useSearchParams();
  const [roomCode, setRoomCode] = useState(params.get("code") ?? "");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const code = normalizeRoomCode(roomCode);
    if (!code) {
      setError("Room codes are 4–8 letters or numbers.");
      return;
    }
    setIsJoining(true);

    try {
      const player = await joinGame(code, username);
      saveSession({
        role: "player",
        code: player.code,
        token: player.token,
        name: player.name,
        cityId: player.cityId,
      });
      navigate(`/play/${player.code}`);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "Unable to join this game.",
      );
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <div className="relative isolate flex w-full flex-1 overflow-hidden">
      <Suspense fallback={null}>
        <WorldBackdrop className="absolute inset-0 -z-20" />
      </Suspense>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-background/75 lg:bg-transparent lg:bg-linear-to-r lg:from-background/95 lg:via-background/55 lg:to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 bg-linear-to-t from-background to-transparent"
      />
      <div className="mx-auto grid w-full max-w-6xl content-start items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_430px] lg:content-center lg:py-20">
        <section className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Player entry
          </p>
          <h1 className="mt-4 font-serif text-5xl tracking-[-0.05em] sm:text-6xl">
            Join your city.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Enter the room code from your teacher and choose the name your team
            will see during the game.
          </p>
        </section>

        <section
          className="rounded-xl border bg-card/90 p-6 shadow-lg backdrop-blur-md sm:p-8"
          aria-labelledby="join-title"
        >
          <div>
            <h2 id="join-title" className="text-xl font-bold tracking-tight">
              Enter game
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              No account needed for players.
            </p>
          </div>

          <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="room-code" className="text-sm font-semibold">
                Room code
              </label>
              <Input
                id="room-code"
                name="roomCode"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={8}
                placeholder="NASH24"
                className="uppercase"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                aria-describedby="room-code-help"
              />
              <p id="room-code-help" className="text-xs text-muted-foreground">
                4–8 letters or numbers
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-semibold">
                Username
              </label>
              <Input
                id="username"
                name="username"
                autoComplete="nickname"
                maxLength={24}
                placeholder="RiverPlanner"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            {error ? (
              <p
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <Button
              className="w-full"
              size="lg"
              type="submit"
              disabled={isJoining}
            >
              {isJoining ? (
                <>
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />{" "}
                  Joining…
                </>
              ) : (
                <>
                  Join game <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
