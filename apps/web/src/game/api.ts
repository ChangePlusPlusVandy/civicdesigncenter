import type {
  ApiError,
  CreateGameResponse,
  GameInfoResponse,
  JoinResponse,
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

export function createGame(cityCount: number): Promise<CreateGameResponse> {
  return request("/games", {
    method: "POST",
    body: JSON.stringify({ cityCount }),
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
