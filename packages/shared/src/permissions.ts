// Which player role may send which action (ARCH-015). The action pipeline
// calls can() after validation and de-duplication and before the engine;
// a `false` is acked `FORBIDDEN` and logged as a rejected attempt
// (ARCH-014).

import { ActionIntentSchema, type ActionType } from "./actions.ts";

// players.role values (ARCH-031). `seat` is the default and today the only
// role; add new roles here together with their row in PERMISSIONS.
export const PLAYER_ROLES = ["seat"] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

// Every intent type in ActionIntentSchema, so a new action needs no edit here.
const ALL_ACTIONS: readonly ActionType[] = ActionIntentSchema.options.map(
  (option) => option.shape.type.value,
);

// ARCH-015: every player role is allowed every player action, gifts included.
const PERMISSIONS: Record<PlayerRole, readonly ActionType[]> = {
  seat: ALL_ACTIONS,
};

// True when `role` may send `actionType`. A role not in PLAYER_ROLES (the
// column is free text, ARCH-031) is allowed nothing.
export function can(role: string, actionType: ActionType): boolean {
  if (!Object.hasOwn(PERMISSIONS, role)) return false;
  return PERMISSIONS[role as PlayerRole].includes(actionType);
}
