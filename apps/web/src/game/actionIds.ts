import type { Ack, ClientIntent } from "@cs/idle";

// One clientActionId per thing a student asked for, kept until the server
// answers. If an ack times out and they press "Try again", the retry carries
// the same id, so the server runs the action at most once even when the
// first attempt did arrive. Once answered, the same intent gets a new id.
export class ActionIds {
  private readonly pending = new Map<string, string>();

  constructor(private readonly newId: () => string) {}

  take(intent: ClientIntent): string {
    const key = JSON.stringify(intent);
    const id = this.pending.get(key) ?? this.newId();
    this.pending.set(key, id);
    return id;
  }

  // OFFLINE means no answer arrived, so the server may or may not have it.
  settle(intent: ClientIntent, ack: Ack): void {
    if (ack.ok || ack.code !== "OFFLINE")
      this.pending.delete(JSON.stringify(intent));
  }
}
