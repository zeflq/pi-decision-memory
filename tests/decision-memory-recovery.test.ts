import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildIndexes } from "../extensions/pi-decision-memory/indexes.js";
import { decodeEvent, encodeEvent, loadEvents } from "../extensions/pi-decision-memory/store.js";
import type { DecisionEvent } from "../extensions/pi-decision-memory/types.js";

describe("decision memory recovery", () => {
	it("rebuilds indexes from JSONL replay", async () => {
		const temp = join(tmpdir(), `decision-memory-rebuild-${Date.now()}`);
		mkdirSync(temp, { recursive: true });
		const filePath = join(temp, "decisions.jsonl");

		const addA: DecisionEvent = {
			v: 1,
			t: "2026-02-27T06:00:00.000Z",
			p: "p123",
			e: "a",
			i: "D-1",
			d: { title: "Use PostgreSQL", text: "Use PostgreSQL", status: "active", tags: ["db"] },
			u: "user",
		};
		const addB: DecisionEvent = {
			v: 1,
			t: "2026-02-27T06:00:01.000Z",
			p: "p123",
			e: "a",
			i: "D-2",
			d: { title: "Use Redis", text: "Use Redis", status: "active", tags: ["cache"] },
			u: "user",
		};
		const removeB: DecisionEvent = {
			v: 1,
			t: "2026-02-27T06:00:02.000Z",
			p: "p123",
			e: "rm",
			i: "D-2",
			d: {},
			u: "user",
		};

		writeFileSync(filePath, `${encodeEvent(addA)}\n${encodeEvent(addB)}\n${encodeEvent(removeB)}\n`);

		const events = await loadEvents(filePath);
		const indexes = buildIndexes(events);

		expect(indexes.byId.has("D-1")).toBe(true);
		expect(indexes.byId.has("D-2")).toBe(false);
		expect(indexes.byStatus.get("active")?.has("D-1")).toBe(true);

		rmSync(temp, { recursive: true, force: true });
	});

	it("regenerates usable state when file contains corrupt lines", async () => {
		const temp = join(tmpdir(), `decision-memory-corrupt-${Date.now()}`);
		mkdirSync(temp, { recursive: true });
		const filePath = join(temp, "decisions.jsonl");

		const valid: DecisionEvent = {
			v: 1,
			t: "2026-02-27T06:00:00.000Z",
			p: "p123",
			e: "a",
			i: "D-1",
			d: { title: "Use PostgreSQL", text: "Use PostgreSQL", status: "active" },
			u: "user",
		};

		writeFileSync(filePath, `not-json\n${encodeEvent(valid)}\n{"v":2}\n`);
		const events = await loadEvents(filePath);
		const decoded = decodeEvent(encodeEvent(valid));
		const indexes = buildIndexes(events);

		expect(decoded?.i).toBe("D-1");
		expect(events).toHaveLength(1);
		expect(indexes.byId.has("D-1")).toBe(true);

		rmSync(temp, { recursive: true, force: true });
	});
});
