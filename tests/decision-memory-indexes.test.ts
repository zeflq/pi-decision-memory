import { describe, expect, it } from "vitest";

import { applyEventToIndexes, buildIndexes } from "../extensions/pi-decision-memory/indexes.js";
import type { DecisionEvent } from "../extensions/pi-decision-memory/types.js";

describe("decision memory indexes", () => {
	it("builds and updates indexes from events", () => {
		const addEvent: DecisionEvent = {
			v: 1,
			t: "2026-02-27T06:00:00.000Z",
			p: "abc",
			e: "a",
			i: "D-1",
			d: { title: "A", text: "A", status: "active", tags: ["db"] },
		};
		const removeEvent: DecisionEvent = {
			v: 1,
			t: "2026-02-27T06:01:00.000Z",
			p: "abc",
			e: "rm",
			i: "D-1",
			d: {},
		};

		const indexes = buildIndexes([addEvent]);
		expect(indexes.byId.has("D-1")).toBe(true);
		expect(indexes.byStatus.get("active")?.has("D-1")).toBe(true);
		expect(indexes.byTag.get("db")?.has("D-1")).toBe(true);

		applyEventToIndexes(indexes, removeEvent);
		expect(indexes.byId.has("D-1")).toBe(false);
		expect(indexes.byStatus.get("active")?.has("D-1")).toBe(false);
	});
});
