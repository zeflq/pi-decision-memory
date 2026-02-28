import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { persistAndApply } from "./command-utils.js";
import type { DecisionCommandDeps, DecisionEvent } from "../types.js";

export async function handleRemove(rest: string, ctx: ExtensionCommandContext, deps: DecisionCommandDeps): Promise<void> {
	const id = rest.trim();
	if (id.length === 0) {
		ctx.ui.notify("Usage: /decision remove <id>", "warning");
		return;
	}

	const existing = deps.state.indexes.byId.get(id);
	if (!existing) {
		ctx.ui.notify(`Decision not found: ${id}`, "warning");
		return;
	}

	const event: DecisionEvent = {
		v: 1,
		t: new Date().toISOString(),
		p: existing.projectId,
		e: "rm",
		i: existing.id,
		d: {},
		u: "user",
	};

	await persistAndApply(event, deps);
	ctx.ui.notify(`Removed decision ${existing.id}`, "info");
}
