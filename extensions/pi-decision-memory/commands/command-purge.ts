import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { persistAndApply } from "./command-utils.js";
import type { Decision, DecisionCommandDeps, DecisionEvent } from "../types.js";

export async function handlePurge(rest: string, ctx: ExtensionCommandContext, deps: DecisionCommandDeps): Promise<void> {
	const confirm = rest.trim() === "--yes";
	const nowMs = Date.now();
	const dayMs = 24 * 60 * 60 * 1000;

	const candidates = Array.from(deps.state.indexes.byId.values()).filter((decision: Decision) => {
		if (decision.status === "active") return false;
		const retention = deps.state.config.retentionDays[decision.status];
		const updatedMs = Date.parse(decision.updatedAt);
		if (!Number.isFinite(updatedMs)) return false;
		return nowMs - updatedMs > retention * dayMs;
	});

	if (!confirm) {
		if (candidates.length === 0) {
			ctx.ui.notify("No purge candidates found.", "info");
			return;
		}
		ctx.ui.notify(`Purge would remove ${candidates.length} decisions. Re-run with /decision purge --yes`, "warning");
		return;
	}

	if (candidates.length === 0) {
		ctx.ui.notify("No purge candidates found.", "info");
		return;
	}

	for (const [index, decision] of candidates.entries()) {
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

	ctx.ui.notify(`Purged ${candidates.length} decisions.`, "info");
}
