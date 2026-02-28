import { describe, expect, it, vi } from "vitest";

import { handleDecisionCommand } from "../extensions/pi-decision-memory/commands/index.js";
import type { DecisionCommandDeps, DecisionEvent } from "../extensions/pi-decision-memory/types.js";
import { createCommandContext, createState } from "./helpers.js";

describe("decision commands toggle and disabled behavior", () => {
	it("enables and disables via scope commands", async () => {
		const state = createState();
		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const setEnabledGlobal = vi.fn(async (enabled: boolean) => {
			state.config.enabled = enabled;
			return true;
		});
		const setEnabledProject = vi.fn(async (enabled: boolean) => {
			state.config.enabled = enabled;
			return true;
		});
		const deps: DecisionCommandDeps = {
			state,
			appendEvent,
			setEnabledGlobal,
			setEnabledProject,
		};
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("disable --project", ctx, deps);
		expect(setEnabledProject).toHaveBeenCalledWith(false);
		expect(state.config.enabled).toBe(false);

		await handleDecisionCommand("enable --global", ctx, deps);
		expect(setEnabledGlobal).toHaveBeenCalledWith(true);
		expect(state.config.enabled).toBe(true);
	});

	it("blocks mutating commands when disabled and does not write", async () => {
		const state = createState();
		state.config.enabled = false;
		const appendEvent = vi.fn(async (_event: DecisionEvent) => {});
		const deps: DecisionCommandDeps = {
			state,
			appendEvent,
		};
		const notify = vi.fn((_msg: string, _level: "info" | "warning" | "error" | "success") => {});
		const ctx = createCommandContext(notify);

		await handleDecisionCommand("add blocked", ctx, deps);
		expect(appendEvent).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith("Decision memory is disabled. Enable it to modify decisions.", "warning");
	});
});
