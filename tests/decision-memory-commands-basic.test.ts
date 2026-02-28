import { describe, expect, it, vi } from "vitest";

import { handleDecisionCommand } from "../extensions/pi-decision-memory/commands/index.js";
import type { Decision, DecisionCommandDeps, DecisionEvent } from "../extensions/pi-decision-memory/types.js";
import { createCommandContext, createState } from "./helpers.js";

describe("decision commands basic", () => {
	it("shows help usage", async () => {
		const state = createState();
		const deps: DecisionCommandDeps = { state, appendEvent: async (_event: DecisionEvent) => {} };
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("help", ctx, deps);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("/decision add <text>"), "info");
	});

	it("adds a decision and updates in-memory indexes", async () => {
		const state = createState();
		const appendEvent = vi.fn(async (event: DecisionEvent) => {
			void event;
		});
		const deps: DecisionCommandDeps = { state, appendEvent };
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("add Use PostgreSQL 16", ctx, deps);

		expect(appendEvent).toHaveBeenCalledTimes(1);
		expect(state.indexes.byId.size).toBe(1);
		const added = Array.from(state.indexes.byId.values())[0] as Decision;
		expect(added.text).toContain("Use PostgreSQL 16");
		expect(added.status).toBe("active");
	});

	it("lists and searches decisions", async () => {
		const state = createState();
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "Use PostgreSQL",
			text: "Primary datastore is PostgreSQL",
			tags: ["db"],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-02-27T06:00:00.000Z",
			updatedAt: "2026-02-27T06:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1"]));
		state.indexes.byTag.set("db", new Set(["D-1"]));

		const deps: DecisionCommandDeps = {
			state,
			appendEvent: async (_event: DecisionEvent) => {},
		};
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("list", ctx, deps);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("D-1 | active"), "info");

		await handleDecisionCommand("search postgres status:active tag:db", ctx, deps);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("D-1 | active"), "info");
	});
});
