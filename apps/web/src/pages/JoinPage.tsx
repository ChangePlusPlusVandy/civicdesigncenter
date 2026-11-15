import { lazy, Suspense, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { normalizeRoomCode } from "@cs/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinGame } from "@/game/api";
import { panel } from "@/game/format";
import { saveSession } from "@/game/session";
import { cn } from "@/lib/utils";

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
        className="pointer-events-none absolute inset-0 -z-10 bg-background/70"
      />
      <div className="mx-auto grid w-full max-w-6xl content-start items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_430px] lg:content-center lg:py-20">
        <section className="max-w-xl">
          <h1 className="text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">
            Join your city.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-foreground/80">
            Your class shares a river, the woods and one market. Grow your city
            without using them up.
          </p>
        </section>

        <section className={cn(panel, "p-6 sm:p-8")} aria-label="Join a game">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="room-code" className="text-sm font-semibold">
                Game code
              </label>
              <Input
                id="room-code"
                name="roomCode"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={8}
                placeholder="NASH24"
                className="h-14 text-center text-2xl font-semibold tracking-[0.2em] uppercase placeholder:font-normal placeholder:tracking-[0.2em]"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                aria-describedby="room-code-help"
              />
              <p id="room-code-help" className="text-sm text-muted-foreground">
                It's on the board. 4–8 letters or numbers.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-semibold">
                Your name
              </label>
              <Input
                id="username"
                name="username"
                autoComplete="nickname"
                maxLength={24}
                placeholder="RiverPlanner"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-describedby="username-help"
                className="h-12 text-base"
              />
              <p id="username-help" className="text-sm text-muted-foreground">
                Your team sees this. No account needed.
              </p>
            </div>

            {error ? (
              <p
                className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
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
