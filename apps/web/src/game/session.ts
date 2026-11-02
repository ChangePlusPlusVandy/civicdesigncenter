import type { CityId } from "@cs/idle";

// What this browser needs to rejoin a game after a refresh. Kept per room
// code, so a teacher can run a game and test as a student in the lab.
export type Session =
  | { role: "teacher"; code: string; token: string }
  | {
      role: "player";
      code: string;
      token: string;
      name: string;
      cityId: CityId;
    };

const key = (code: string, role: Session["role"]) =>
  `citysettlers:${role}:${code}`;

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(
      key(session.code, session.role),
      JSON.stringify(session),
    );
  } catch {
    // Private mode or blocked storage: the game still works until a refresh.
  }
}

export function loadSession(
  code: string,
  role: Session["role"],
): Session | null {
  try {
    const raw = localStorage.getItem(key(code, role));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearSession(code: string, role: Session["role"]): void {
  try {
    localStorage.removeItem(key(code, role));
  } catch {
    // Nothing to clear.
  }
}
