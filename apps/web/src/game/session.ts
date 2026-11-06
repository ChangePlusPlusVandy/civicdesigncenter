import type { CityId } from "@cs/idle";

// What this browser needs to rejoin a game after a refresh. Kept per room
// code and role. `seat` lets one browser hold several students (the dev lab
// runs four in iframes) without putting tokens in URLs.
export type Session =
  | { role: "teacher"; code: string; token: string }
  | {
      role: "player";
      code: string;
      token: string;
      name: string;
      cityId: CityId;
    };

const key = (code: string, role: Session["role"], seat?: string) =>
  `citysettlers:${role}:${code}${seat ? `:${seat}` : ""}`;

export function saveSession(session: Session, seat?: string): void {
  try {
    localStorage.setItem(
      key(session.code, session.role, seat),
      JSON.stringify(session),
    );
  } catch {
    // Private mode or blocked storage: the game still works until a refresh.
  }
}

export function loadSession(
  code: string,
  role: Session["role"],
  seat?: string,
): Session | null {
  try {
    const raw = localStorage.getItem(key(code, role, seat));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearSession(
  code: string,
  role: Session["role"],
  seat?: string,
): void {
  try {
    localStorage.removeItem(key(code, role, seat));
  } catch {
    // Nothing to clear.
  }
}
