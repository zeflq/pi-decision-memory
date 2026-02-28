import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import type { DecisionCommandDeps } from "../types.js";

export async function handleStatus(ctx: ExtensionCommandContext, deps: DecisionCommandDeps): Promise<void> {
	const size = deps.state.indexes.byId.size;
	const enabled = deps.state.config.enabled ? "enabled" : "disabled";
	const project = deps.state.identity?.projectHash ?? "<unresolved>";
	ctx.ui.notify(`Decision memory: ${enabled} | project=${project} | decisions=${size}`, "info");
}
