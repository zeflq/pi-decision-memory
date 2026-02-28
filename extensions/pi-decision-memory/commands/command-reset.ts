import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { persistAndApply } from "./command-utils.js";
import type { DecisionCommandDeps, DecisionEvent } from "../types.js";

export async function handleReset(rest: string, ctx: ExtensionCommandContext, deps: DecisionCommandDeps): Promise<void> {
	const confirm = rest.trim() === "--yes";
	const allDecisions = Array.from(deps.state.indexes.byId.values());

	if (allDecisions.length === 0) {
		ctx.ui.notify("No decisions to clear.", "info");
		return;
	}

	if (!confirm) {
		ctx.ui.notify(
			`Reset would remove ${allDecisions.length} decisions. Re-run with /decision reset --yes`,
			"warning",
		);
		return;
	}

	const nowMs = Date.now();
	for (const [index, decision] of allDecisions.entries()) {
		const event: DecisionEvent = {
			v: 1,
			t: new Date(nowMs + index).toISOString(),
			p: decision.projectId,
			e: "rm",
			i: decision.id,
			d: {},
			u: "user",
		};
		await persistAndApply(event, deps);
	}

	ctx.ui.notify(`Cleared ${allDecisions.length} decisions.`, "info");
}
