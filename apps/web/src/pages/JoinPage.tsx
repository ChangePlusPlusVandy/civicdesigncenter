import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockJoinGame } from "@/lib/mock-join";

export function JoinPage() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsJoining(true);

    try {
      const player = await mockJoinGame({ roomCode, username });
      navigate(`/play/${player.roomCode}`, {
        state: { username: player.username },
      });
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
        className="rounded-xl border bg-card p-6 shadow-sm sm:p-8"
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
              value={roomCode}
              onChange={(event) =>
                setRoomCode(event.target.value.toUpperCase())
              }
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
  );
}
