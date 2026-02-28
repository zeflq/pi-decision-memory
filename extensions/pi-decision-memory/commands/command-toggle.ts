import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { parseToggleScope } from "./command-utils.js";
import type { DecisionCommandDeps } from "../types.js";

export async function handleToggle(
	rest: string,
	enabled: boolean,
	ctx: ExtensionCommandContext,
	deps: DecisionCommandDeps,
): Promise<void> {
	const scope = parseToggleScope(rest);
	if (!scope) {
		ctx.ui.notify(`Usage: /decision ${enabled ? "enable" : "disable"} --global|--project`, "warning");
		return;
	}

	const ok =
		scope === "global"
			? await deps.setEnabledGlobal?.(enabled)
			: await deps.setEnabledProject?.(enabled);

	if (!ok) {
		ctx.ui.notify(`Could not ${enabled ? "enable" : "disable"} decision memory for ${scope}.`, "error");
		return;
	}

	ctx.ui.notify(`Decision memory ${enabled ? "enabled" : "disabled"} (${scope}).`, "info");
}
