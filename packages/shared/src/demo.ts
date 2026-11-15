// TEMPORARY walking-skeleton game creation (#19), replaced by the facilitator
// console and player join (#24, #36). See ARCHITECTURE §8 (ARCH-063).

// One seat per scenario city. `token` is the seat's player token (ARCH-030).
export type DemoSeat = { cityId: string; cityName: string; token: string };

// Body of `201` from `POST /api/demo/games`.
export type DemoGameResponse = {
  roomCode: string;
  // Authenticates the read-only projector view (ARCH-036).
  projectorKey: string;
  seats: DemoSeat[];
};
