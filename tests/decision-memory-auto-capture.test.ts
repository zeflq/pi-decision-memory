import { describe, expect, it, vi } from "vitest";

import { autoCaptureDecisionsFromUserPrompt } from "../extensions/pi-decision-memory/auto-capture.js";
import type { DecisionCommandDeps } from "../extensions/pi-decision-memory/types.js";
import { createState } from "./helpers.js";

function createExtensionContext(confirmResult = true) {
	return {
		hasUI: true,
		ui: {
			confirm: vi.fn(async () => confirmResult),
			notify: vi.fn(),
		},
	} as const;
}

function createDeps(): DecisionCommandDeps {
	const state = createState();
	return {
		state,
		appendEvent: async () => {},
	};
}

describe("decision memory auto-capture", () => {
	it("captures explicit 'Decision:' lines from user prompt", async () => {
		const deps = createDeps();
		deps.state.config.autoCapture.enabled = true;
		deps.state.config.autoCapture.confirm = true;
		deps.state.config.autoCapture.maxPerTurn = 2;
		const ctx = createExtensionContext(true);

		await autoCaptureDecisionsFromUserPrompt(
			"Decision: Use PostgreSQL as primary database\nDecision: Use JWT for auth tokens",
			ctx as never,
			deps,
		);

		expect(deps.state.indexes.byId.size).toBe(2);
		expect(ctx.ui.confirm).toHaveBeenCalledTimes(2);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Auto-captured decision"), "info");
	});

	it("respects maxPerTurn limit", async () => {
		const deps = createDeps();
		deps.state.config.autoCapture.enabled = true;
		deps.state.config.autoCapture.confirm = false;
		deps.state.config.autoCapture.maxPerTurn = 1;
		const ctx = createExtensionContext(true);

		await autoCaptureDecisionsFromUserPrompt(
			"Decision: Use PostgreSQL as primary database\nDecision: Use Redis as cache layer",
			ctx as never,
			deps,
		);

		expect(deps.state.indexes.byId.size).toBe(1);
	});

	it("skips duplicate active decisions", async () => {
		const deps = createDeps();
		deps.state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p123",
			title: "Use PostgreSQL",
			text: "Use PostgreSQL as primary database",
			tags: [],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		deps.state.indexes.byStatus.set("active", new Set(["D-1"]));
		deps.state.config.autoCapture.enabled = true;
		deps.state.config.autoCapture.confirm = false;
		const ctx = createExtensionContext(true);

		await autoCaptureDecisionsFromUserPrompt("Decision: Use PostgreSQL as primary database", ctx as never, deps);

		expect(deps.state.indexes.byId.size).toBe(1);
		expect(ctx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining("Auto-captured decision"), "info");
	});

	it("does not capture non-explicit recommendation/explanatory text", async () => {
		const deps = createDeps();
		deps.state.config.autoCapture.enabled = true;
		deps.state.config.autoCapture.confirm = true;
		const ctx = createExtensionContext(true);

		await autoCaptureDecisionsFromUserPrompt(
			"It stores decisions in the project itself at: .pi/decision-memory/decisions.jsonl\nRecommended: choose option A",
			ctx as never,
			deps,
		);

		expect(deps.state.indexes.byId.size).toBe(0);
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
	});

	it("does nothing when autoCapture is disabled", async () => {
		const deps = createDeps();
		deps.state.config.autoCapture.enabled = false;
		const ctx = createExtensionContext(true);

		await autoCaptureDecisionsFromUserPrompt("Decision: Use PostgreSQL as primary database", ctx as never, deps);

		expect(deps.state.indexes.byId.size).toBe(0);
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
	});
});
