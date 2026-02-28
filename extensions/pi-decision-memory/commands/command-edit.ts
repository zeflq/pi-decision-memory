import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { persistAndApply, splitIdAndText } from "./command-utils.js";
import type { DecisionCommandDeps, DecisionEvent } from "../types.js";

export async function handleEdit(rest: string, ctx: ExtensionCommandContext, deps: DecisionCommandDeps): Promise<void> {
	const parsed = splitIdAndText(rest);
	if (!parsed) {
		ctx.ui.notify("Usage: /decision edit <id> <text>", "warning");
		return;
	}

	const existing = deps.state.indexes.byId.get(parsed.id);
	if (!existing) {
		ctx.ui.notify(`Decision not found: ${parsed.id}`, "warning");
		return;
	}

	const event: DecisionEvent = {
		v: 1,
		t: new Date().toISOString(),
		p: existing.projectId,
		e: "ed",
		i: existing.id,
		d: {
			title: parsed.text.slice(0, 80),
			text: parsed.text,
		},
		u: "user",
	};

	await persistAndApply(event, deps);
	ctx.ui.notify(`Edited decision ${existing.id}`, "info");
}
