import { describe, expect, it, vi } from "vitest";

import { handleDecisionCommand } from "../extensions/pi-decision-memory/commands/index.js";
import type { DecisionCommandDeps, DecisionEvent } from "../extensions/pi-decision-memory/types.js";
import { createCommandContext, createState } from "./helpers.js";

describe("decision commands mutations", () => {
	it("edits an existing decision", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "Old title",
			text: "Old text",
			tags: ["db"],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-02-27T06:00:00.000Z",
			updatedAt: "2026-02-27T06:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));
		state.indexes.byTag.set("db", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("edit D-1 New text content", ctx, deps);

		expect(appendEvent).toHaveBeenCalledTimes(1);
		expect(state.indexes.byId.get("D-1")?.text).toBe("New text content");
		expect(notify).toHaveBeenCalledWith("Edited decision D-1", "info");
	});

	it("removes an existing decision", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "Title",
			text: "Text",
			tags: ["db"],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-02-27T06:00:00.000Z",
			updatedAt: "2026-02-27T06:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));
		state.indexes.byTag.set("db", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("remove D-1", ctx, deps);

		expect(appendEvent).toHaveBeenCalledTimes(1);
		expect(state.indexes.byId.has("D-1")).toBe(false);
		expect(notify).toHaveBeenCalledWith("Removed decision D-1", "info");
	});

	it("supersedes an existing decision", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "Old",
			text: "Old",
			tags: [],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-02-27T06:00:00.000Z",
			updatedAt: "2026-02-27T06:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("supersede D-1 New replacement", ctx, deps);

		expect(appendEvent).toHaveBeenCalledTimes(2);
		expect(state.indexes.byId.get("D-1")?.status).toBe("superseded");
		const replacement = Array.from(state.indexes.byId.values()).find((d) => d.id !== "D-1");
		expect(replacement?.status).toBe("active");
		expect(replacement?.supersedes).toBe("D-1");
	});

	it("requires confirmation for purge", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "Old draft",
			text: "Old draft",
			tags: [],
			status: "draft",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2025-01-01T00:00:00.000Z",
			updatedAt: "2025-01-01T00:00:00.000Z",
		});
		state.indexes.byStatus.set("draft", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("purge", ctx, deps);
		expect(appendEvent).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Re-run with /decision purge --yes"), "warning");
	});

	it("purges eligible non-active decisions with --yes", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "Old rejected",
			text: "Old rejected",
			tags: [],
			status: "rejected",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2025-01-01T00:00:00.000Z",
			updatedAt: "2025-01-01T00:00:00.000Z",
		});
		state.indexes.byStatus.set("rejected", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("purge --yes", ctx, deps);
		expect(appendEvent).toHaveBeenCalledTimes(1);
		expect(state.indexes.byId.has("D-1")).toBe(false);
		expect(notify).toHaveBeenCalledWith("Purged 1 decisions.", "info");
	});

	it("requires confirmation for reset", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "A",
			text: "A",
			tags: [],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-02-27T06:00:00.000Z",
			updatedAt: "2026-02-27T06:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("reset", ctx, deps);
		expect(appendEvent).not.toHaveBeenCalled();
		expect(state.indexes.byId.has("D-1")).toBe(true);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("/decision reset --yes"), "warning");
	});

	it("clears all decisions with reset --yes (and clear alias)", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "A",
			text: "A",
			tags: [],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-02-27T06:00:00.000Z",
			updatedAt: "2026-02-27T06:00:00.000Z",
		});
		state.indexes.byId.set("D-2", {
			id: "D-2",
			projectId: "p123",
			title: "B",
			text: "B",
			tags: [],
			status: "draft",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-02-27T06:00:00.000Z",
			updatedAt: "2026-02-27T06:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));
		state.indexes.byStatus.set("draft", new Set(["D-2"]));

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("clear --yes", ctx, deps);
		expect(appendEvent).toHaveBeenCalledTimes(2);
		expect(state.indexes.byId.size).toBe(0);
		expect(notify).toHaveBeenCalledWith("Cleared 2 decisions.", "info");
	});
});
