import { normalizeRoomCode } from "@cs/shared";

export interface JoinRequest {
  roomCode: string;
  username: string;
}

export interface JoinResult {
  roomCode: string;
  username: string;
}

export async function mockJoinGame({
  roomCode,
  username,
}: JoinRequest): Promise<JoinResult> {
  const normalizedCode = normalizeRoomCode(roomCode);
  const normalizedUsername = username.trim();

  if (!normalizedCode) {
    throw new Error("Room codes are 4–8 letters or numbers.");
  }

  if (normalizedUsername.length < 2 || normalizedUsername.length > 24) {
    throw new Error("Choose a username between 2 and 24 characters.");
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  return { roomCode: normalizedCode, username: normalizedUsername };
}
