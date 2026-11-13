// The sandbox's event catalog and its spec must list the same event types.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENT_SCHEMAS } from "@cs/idle";

describe("docs/EVENTS.md §7", () => {
  it("lists every event type in the catalog, and no others", () => {
    const spec = readFileSync(
      new URL("../../../../docs/EVENTS.md", import.meta.url),
      "utf8",
    );
    const section = spec.slice(spec.indexOf("## 7."));
    const documented = [
      ...section.matchAll(/^\| `([a-z_]+\.[a-z_.]+)` /gm),
    ].map((match) => match[1]);
    expect(new Set(documented)).toEqual(new Set(Object.keys(EVENT_SCHEMAS)));
  });
});
