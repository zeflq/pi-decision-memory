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
	it("classifies and prepares durable candidates only", () => {
		const deps = createDeps();
		deps.state.config.autoCapture.maxPerTurn = 4;

		preparePendingAutoCaptureFromPrompt(
			"Decision: Use PostgreSQL as primary database\nRun tests now\nIn this project we will use clean architecture\nWhat should we do?",
			deps,
		);

		expect(deps.state.pendingAutoCaptureCandidates.map((c) => c.normalizedText)).toEqual([
			"Use PostgreSQL as primary database",
			"In this project we will use clean architecture",
		]);
	});

	it("captures selected candidates after agent_end", async () => {
		const deps = createDeps();
		deps.state.config.autoCapture.enabled = true;
		deps.state.config.autoCapture.confirm = true;
		preparePendingAutoCaptureFromPrompt(
			"Decision: Use PostgreSQL as primary database\nDecision: Use Redis as cache layer",
			deps,
		);
		expect(deps.state.pendingAutoCaptureCandidates).toHaveLength(2);

		const first = deps.state.pendingAutoCaptureCandidates[0];
		const second = deps.state.pendingAutoCaptureCandidates[1];
		const ctx = createExtensionContext([
			`${first.normalizedText} (${first.category}, ${Math.round(first.confidence * 100)}%)`,
			`${second.normalizedText} (${second.category}, ${Math.round(second.confidence * 100)}%)`,
			"Done",
		]);
		await finalizePendingAutoCapture(
			[{ role: "assistant", content: [{ type: "text", text: "completed" }] }] as never,
			ctx as never,
			deps,
		);

		expect(deps.state.indexes.byId.size).toBe(2);
		const added = Array.from(deps.state.indexes.byId.values())[0];
		expect(added.source).toBe("auto-rule-classifier");
		expect(typeof added.confidence).toBe("number");
		expect(ctx.ui.select).toHaveBeenCalled();
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
		const ctx = createExtensionContext(["Done"]);

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
	});
});
