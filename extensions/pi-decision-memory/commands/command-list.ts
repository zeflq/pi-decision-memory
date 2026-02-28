import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { renderDecision } from "./command-utils.js";
import type { Decision, DecisionCommandDeps } from "../types.js";

export async function handleList(ctx: ExtensionCommandContext, deps: DecisionCommandDeps): Promise<void> {
	const decisions: Decision[] = Array.from(deps.state.indexes.byId.values());
	decisions.sort((a: Decision, b: Decision) => b.updatedAt.localeCompare(a.updatedAt));
	if (decisions.length === 0) {
		ctx.ui.notify("No decisions found.", "info");
		return;
	}

	const lines = decisions.slice(0, 25).map((decision: Decision) => renderDecision(decision));
	ctx.ui.notify(lines.join("\n"), "info");
}
