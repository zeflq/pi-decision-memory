import { describe, expect, it, vi } from "vitest";

import { finalizePendingAutoCapture, preparePendingAutoCaptureFromPrompt } from "../extensions/pi-decision-memory/auto-capture.js";
import type { DecisionCommandDeps } from "../extensions/pi-decision-memory/types.js";
import { createState } from "./helpers.js";

function createExtensionContext(selectQueue: string[] = [], confirmResult = true) {
	return {
		hasUI: true,
		ui: {
			select: vi.fn(async () => selectQueue.shift()),
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
	it("prepares candidates from explicit and directive prompt lines", () => {
		const deps = createDeps();
		deps.state.config.autoCapture.maxPerTurn = 3;

		preparePendingAutoCaptureFromPrompt(
			"Decision: Use PostgreSQL as primary database\nUse Tailwind for styling\nWhat should we do?",
			deps,
		);

		expect(deps.state.pendingAutoCaptureCandidates).toEqual([
			"Use PostgreSQL as primary database",
			"Use Tailwind for styling",
		]);
	});

	it("captures selected candidates after agent_end", async () => {
		const deps = createDeps();
		deps.state.config.autoCapture.enabled = true;
		deps.state.config.autoCapture.confirm = true;
		preparePendingAutoCaptureFromPrompt(
			"Decision: Use PostgreSQL as primary database\nDecision: Use JWT for auth tokens",
			deps,
		);

		const ctx = createExtensionContext([
			"Use PostgreSQL as primary database",
			"Use JWT for auth tokens",
			"Done",
		]);
		await finalizePendingAutoCapture(
			[{ role: "assistant", content: [{ type: "text", text: "completed" }] }] as never,
			ctx as never,
			deps,
		);

		expect(deps.state.indexes.byId.size).toBe(2);
		expect(ctx.ui.select).toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Auto-captured decision"), "info");
	});

	it("falls back to confirm flow if select fails", async () => {
		const deps = createDeps();
		deps.state.config.autoCapture.confirm = true;
		preparePendingAutoCaptureFromPrompt("Decision: Use PostgreSQL as primary database", deps);

		const ctx = {
			hasUI: true,
			ui: {
				select: vi.fn(async () => {
					throw new Error("no select");
				}),
				confirm: vi.fn(async () => true),
				notify: vi.fn(),
			},
		} as const;

		await finalizePendingAutoCapture(
			[{ role: "assistant", content: [{ type: "text", text: "completed" }] }] as never,
			ctx as never,
			deps,
		);

		expect(deps.state.indexes.byId.size).toBe(1);
		expect(ctx.ui.confirm).toHaveBeenCalled();
	});

	it("skips final capture prompt on failed/aborted runs", async () => {
		const deps = createDeps();
		preparePendingAutoCaptureFromPrompt("Decision: Use PostgreSQL as primary database", deps);
		const ctx = createExtensionContext(["Use PostgreSQL as primary database", "Done"]);

		await finalizePendingAutoCapture(
			[{ role: "assistant", content: [{ type: "text", text: "failed" }], stopReason: "error" }] as never,
			ctx as never,
			deps,
		);

		expect(deps.state.indexes.byId.size).toBe(0);
		expect(ctx.ui.select).not.toHaveBeenCalled();
	});

	it("does nothing when autoCapture is disabled", async () => {
		const deps = createDeps();
		deps.state.config.autoCapture.enabled = false;
		preparePendingAutoCaptureFromPrompt("Decision: Use PostgreSQL as primary database", deps);
		expect(deps.state.pendingAutoCaptureCandidates).toEqual([]);

		const ctx = createExtensionContext(["Done"]);
		await finalizePendingAutoCapture(
			[{ role: "assistant", content: [{ type: "text", text: "completed" }] }] as never,
			ctx as never,
			deps,
		);
		expect(deps.state.indexes.byId.size).toBe(0);
	});
});
