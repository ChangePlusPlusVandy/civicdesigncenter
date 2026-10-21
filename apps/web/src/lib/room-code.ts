const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;

export function normalizeRoomCode(code: string | undefined): string | null {
  if (!code) {
    return null;
  }

  const normalizedCode = code.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalizedCode) ? normalizedCode : null;
}
