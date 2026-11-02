import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createGame, joinGame } from "@/game/api";
import { saveSession } from "@/game/session";

const STUDENTS = ["Ana", "Ben", "Cy", "Dee"];

// Dev only: one click makes a class (teacher + 4 students on 4 cities) and
// shows every screen side by side, for checking multiplayer by hand.
export function LabPage() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const game = await createGame(4);
      saveSession({
        role: "teacher",
        code: game.code,
        token: game.teacherToken,
      });
      for (const [i, name] of STUDENTS.entries()) {
        const player = await joinGame(game.code, name);
        saveSession(
          {
            role: "player",
            code: player.code,
            token: player.token,
            name: player.name,
            cityId: player.cityId,
          },
          String(i + 1),
        );
      }
      setCode(game.code);
    } catch (labError) {
      setError(
        labError instanceof Error
          ? labError.message
          : "Couldn't set up the lab.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <h1 className="font-bold">Multiplayer lab</h1>
        <span className="text-sm text-muted-foreground">
          {code
            ? `Room ${code}: teacher, projector and ${STUDENTS.length} students`
            : "Dev only"}
        </span>
        <Button
          className="ml-auto"
          size="default"
          onClick={create}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {code ? "New test class" : "Create test class"}
        </Button>
      </header>
      {error ? (
        <p className="p-4 text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {code ? (
        <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-1 bg-border p-1">
          <iframe
            title="Teacher"
            src={`/teach/${code}`}
            className="h-full w-full bg-background"
          />
          <iframe
            title="Projector"
            src={`/projector/${code}`}
            className="h-full w-full bg-background"
          />
          {STUDENTS.map((name, i) => (
            <iframe
              key={name}
              title={`Student ${name}`}
              src={`/play/${code}?seat=${i + 1}`}
              className="h-full w-full bg-background"
            />
          ))}
        </div>
      ) : (
        <p className="m-auto max-w-md text-center text-muted-foreground">
          Creates a 4-city game, joins Ana, Ben, Cy and Dee, and opens every
          screen here. Start the game from the teacher frame, then build in one
          student frame and watch the others update.
        </p>
      )}
    </div>
  );
}
