// Socket.IO room names for the main game (ARCH-020). Every name starts with
// the game id, so one game's broadcast never reaches another game.
export const rooms = {
  game: (gameId: number) => `game:${gameId}`,
  team: (gameId: number, teamId: number) => `game:${gameId}:team:${teamId}`,
  player: (gameId: number, participantId: string) =>
    `game:${gameId}:player:${participantId}`,
  projector: (gameId: number) => `game:${gameId}:projector`,
  teacher: (gameId: number) => `game:${gameId}:teacher`,
};
