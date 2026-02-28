import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { decodeEvent, encodeEvent, loadEvents } from "../extensions/pi-decision-memory/store.js";
import type { DecisionEvent } from "../extensions/pi-decision-memory/types.js";

describe("decision memory store", () => {
	it("encodes and decodes compact events", () => {
		const event: DecisionEvent = {
			v: 1,
			t: "2026-02-27T06:00:00.000Z",
			p: "abc",
			e: "a",
			i: "D-2026-02-27-0001",
			d: {
				title: "Use PostgreSQL",
				text: "Primary datastore",
				tags: ["db"],
				status: "active",
				reason: "Integrity",
				supersedes: null,
				conflictsWith: [],
			},
			u: "user",
		};

		const encoded = encodeEvent(event);
		expect(encoded.includes('"t"')).toBe(true);
		expect(encoded.includes('"p"')).toBe(true);
		expect(encoded.includes('"e"')).toBe(true);
		expect(encoded.includes('"i"')).toBe(true);
		expect(encoded.includes('"d"')).toBe(true);

		const decoded = decodeEvent(encoded);
		expect(decoded).toEqual(event);
	});

	it("loads only valid events from JSONL", async () => {
		const temp = join(tmpdir(), `decision-memory-store-${Date.now()}`);
		mkdirSync(temp, { recursive: true });
		const filePath = join(temp, "events.jsonl");
		const validEvent: DecisionEvent = {
			v: 1,
			t: "2026-02-27T06:00:00.000Z",
			p: "abc",
			e: "a",
			i: "D-2026-02-27-0001",
			d: { text: "x", status: "active" },
		};

		writeFileSync(filePath, `${encodeEvent(validEvent)}\n{"v":2}\nnot-json\n`);
		const events = await loadEvents(filePath);
		expect(events).toHaveLength(1);
		expect(events[0].i).toBe("D-2026-02-27-0001");

		rmSync(temp, { recursive: true, force: true });
	});
});
