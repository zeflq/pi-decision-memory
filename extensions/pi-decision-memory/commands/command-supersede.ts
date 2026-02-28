import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { createAddEvent, persistAndApply, splitIdAndText } from "./command-utils.js";
import type { DecisionCommandDeps, DecisionEvent } from "../types.js";

export async function handleSupersede(
	rest: string,
	ctx: ExtensionCommandContext,
	deps: DecisionCommandDeps,
): Promise<void> {
	const parsed = splitIdAndText(rest);
	if (!parsed) {
		ctx.ui.notify("Usage: /decision supersede <oldId> <newText>", "warning");
		return;
	}

	const existing = deps.state.indexes.byId.get(parsed.id);
	if (!existing) {
		ctx.ui.notify(`Decision not found: ${parsed.id}`, "warning");
		return;
	}

	const now = new Date();
	const markSuperseded: DecisionEvent = {
		v: 1,
		t: now.toISOString(),
		p: existing.projectId,
		e: "st",
		i: existing.id,
		d: {
			status: "superseded",
			reason: "Superseded by new decision",
		},
		u: "user",
	};

	const addReplacement = createAddEvent(deps, parsed.text, new Date(now.getTime() + 1), existing.id);
	if (!addReplacement) {
		ctx.ui.notify("Project identity is not ready yet. Try again.", "warning");
		return;
	}

	await persistAndApply(markSuperseded, deps);
	await persistAndApply(addReplacement, deps);
	ctx.ui.notify(`Superseded ${existing.id} with ${addReplacement.i}`, "info");
}
