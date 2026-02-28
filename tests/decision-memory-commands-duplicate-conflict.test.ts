import { describe, expect, it, vi } from "vitest";

import { handleDecisionCommand } from "../extensions/pi-decision-memory/commands/index.js";
import type { DecisionCommandDeps, DecisionEvent } from "../extensions/pi-decision-memory/types.js";
import { createState } from "./helpers.js";

function createContextWithSelect(choice: string) {
	return {
		hasUI: true,
		ui: {
			notify: vi.fn(),
			select: vi.fn(async () => choice),
		},
	} as const;
}

describe("decision commands duplicate/conflict", () => {
	it("duplicate -> update existing", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "Use PostgreSQL",
			text: "Use PostgreSQL as primary DB",
			tags: [],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const ctx = createContextWithSelect("Update existing");

		await handleDecisionCommand("add Use PostgreSQL as primary DB", ctx as never, deps);

		expect(appendEvent).toHaveBeenCalledTimes(1);
		expect(state.indexes.byId.get("D-1")?.text).toBe("Use PostgreSQL as primary DB");
		expect(ctx.ui.notify).toHaveBeenCalledWith("Updated existing decision D-1", "info");
	});

	it("duplicate -> force create", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "Use PostgreSQL",
			text: "Use PostgreSQL as primary DB",
			tags: [],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const ctx = createContextWithSelect("Force create");

		await handleDecisionCommand("add Use PostgreSQL as primary DB", ctx as never, deps);

		expect(appendEvent).toHaveBeenCalledTimes(1);
		expect(state.indexes.byId.size).toBe(2);
	});

	it("conflict -> supersede first", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "MySQL default",
			text: "Use MySQL as primary database",
			tags: [],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const ctx = createContextWithSelect("Supersede first conflict");

		await handleDecisionCommand("add Do not use MySQL as primary database", ctx as never, deps);

		expect(appendEvent).toHaveBeenCalledTimes(2);
		expect(state.indexes.byId.get("D-1")?.status).toBe("superseded");
		const replacement = Array.from(state.indexes.byId.values()).find((d) => d.id !== "D-1");
		expect(replacement?.supersedes).toBe("D-1");
	});

	it("conflict -> keep both and mark conflict", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "MySQL default",
			text: "Use MySQL as primary database",
			tags: [],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const ctx = createContextWithSelect("Keep both and mark conflict");

		await handleDecisionCommand("add Do not use MySQL as primary database", ctx as never, deps);

		expect(appendEvent).toHaveBeenCalledTimes(1);
		const created = Array.from(state.indexes.byId.values()).find((d) => d.id !== "D-1");
		expect(created?.conflictsWith).toContain("D-1");
	});
});
