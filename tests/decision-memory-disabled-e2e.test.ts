import { describe, expect, it, vi } from "vitest";

import { finalizePendingAutoCapture, preparePendingAutoCaptureFromPrompt } from "../extensions/pi-decision-memory/auto-capture.js";
import { handleDecisionCommand } from "../extensions/pi-decision-memory/commands/index.js";
import { buildContextInjection } from "../extensions/pi-decision-memory/context.js";
import type { DecisionCommandDeps, DecisionEvent } from "../extensions/pi-decision-memory/types.js";
import { createCommandContext, createState } from "./helpers.js";

describe("decision memory disabled mode e2e", () => {
	it("prevents writes and context injection when globally disabled", async () => {
		const state = createState();
		state.config.enabled = false;

		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = { state, appendEvent };

		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const cmdCtx = createCommandContext(notify);

		await handleDecisionCommand("add Use PostgreSQL", cmdCtx, deps);
		expect(appendEvent).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith("Decision memory is disabled. Enable it to modify decisions.", "warning");

		preparePendingAutoCaptureFromPrompt("Decision: Use PostgreSQL as primary database", deps);
		expect(state.pendingAutoCaptureCandidates).toEqual([]);
		await finalizePendingAutoCapture(
			[{ role: "assistant", content: [{ type: "text", text: "done" }] }] as never,
			{ hasUI: true, ui: { confirm: vi.fn(async () => true), select: vi.fn(), notify: vi.fn() } } as never,
			deps,
		);
		expect(appendEvent).not.toHaveBeenCalled();
		expect(state.indexes.byId.size).toBe(0);

		const injection = buildContextInjection(
			{ type: "before_agent_start", systemPrompt: "base", prompt: "x", images: [] },
			state,
		);
		expect(injection).toBeUndefined();
	});
});
