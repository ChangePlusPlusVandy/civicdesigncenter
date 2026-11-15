// Types and schemas shared by the web client and the server.

const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;

export type HealthResponse = {
  ok: true;
  engineVersion: string;
};

export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as HealthResponse).ok === true &&
    typeof (value as HealthResponse).engineVersion === "string"
  );
}

export function normalizeRoomCode(code: string | undefined): string | null {
  if (!code) {
    return null;
  }

  const normalizedCode = code.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalizedCode) ? normalizedCode : null;
}

export * from "./actions.ts";
export * from "./scenario.ts";
