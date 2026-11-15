import type {
  ApiError,
  CreateGameResponse,
  GameInfoResponse,
  JoinResponse,
  MapId,
} from "@cs/idle";

// Blank locally and when the server serves the client (same origin).
export const API_URL: string = import.meta.env.VITE_API_URL ?? "";

export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/sandbox${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new RequestError(
      "OFFLINE",
      "Can't reach the game server. Check your internet connection.",
    );
  }
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok || body === null) {
    const error = body as ApiError | null;
    throw new RequestError(
      error?.error ?? "SERVER",
      error?.message ?? "Something went wrong on the server.",
    );
  }
  return body as T;
}

export function createGame(
  cityCount: number,
  mapId: MapId = "nashville",
): Promise<CreateGameResponse> {
  return request("/games", {
    method: "POST",
    body: JSON.stringify({ cityCount, mapId }),
  });
}

export function getGame(code: string): Promise<GameInfoResponse> {
  return request(`/games/${encodeURIComponent(code)}`);
}

export function joinGame(code: string, name: string): Promise<JoinResponse> {
  return request(`/games/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export type ExportFile =
  "activity.csv" | "reflections.csv" | "cities.csv" | "events.csv" | "all.json";

// Downloads one of the teacher's exports. It needs the teacher token in a
// header, so it's fetched and saved here rather than linked.
export async function downloadExport(
  code: string,
  teacherToken: string,
  file: ExportFile,
): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/sandbox/games/${encodeURIComponent(code)}/export/${file}`,
    { headers: { authorization: `Bearer ${teacherToken}` } },
  ).catch(() => null);
  if (!res?.ok) {
    throw new RequestError("EXPORT", "Couldn't download that. Try again.");
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `citysettlers-${code}-${file}`;
  link.click();
  URL.revokeObjectURL(url);
}
