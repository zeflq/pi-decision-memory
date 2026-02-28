import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { normalizeText, renderDecision } from "./command-utils.js";
import type { Decision, DecisionCommandDeps } from "../types.js";

export async function handleSearch(rest: string, ctx: ExtensionCommandContext, deps: DecisionCommandDeps): Promise<void> {
	if (rest.length === 0) {
		ctx.ui.notify("Usage: /decision search <query>", "warning");
		return;
	}

	const terms = rest.split(/\s+/).filter((term: string) => term.length > 0);
	let statusFilter: string | null = null;
	const tagFilters: string[] = [];
	const freeText: string[] = [];

	for (const term of terms) {
		if (term.startsWith("status:")) {
			statusFilter = term.slice("status:".length).toLowerCase();
			continue;
		}
		if (term.startsWith("tag:")) {
			tagFilters.push(term.slice("tag:".length).toLowerCase());
			continue;
		}
		freeText.push(term.toLowerCase());
	}

	const decisions: Decision[] = Array.from(deps.state.indexes.byId.values());
	const matches = decisions.filter((decision: Decision) => {
		if (statusFilter && decision.status.toLowerCase() !== statusFilter) {
			return false;
		}

		if (tagFilters.length > 0) {
			const decisionTags = decision.tags.map((tag: string) => tag.toLowerCase());
			for (const tagFilter of tagFilters) {
				if (!decisionTags.includes(tagFilter)) {
					return false;
				}
			}
		}

		if (freeText.length === 0) {
			return true;
		}

		const haystack = normalizeText(
			[
				decision.id,
				decision.title,
				decision.text,
				decision.tags.join(" "),
				decision.reason ?? "",
				decision.status,
			].join(" "),
		);
		for (const term of freeText) {
			if (!haystack.includes(normalizeText(term))) {
				return false;
			}
		}
		return true;
	});

	if (matches.length === 0) {
		ctx.ui.notify("No matching decisions found.", "info");
		return;
	}

	matches.sort((a: Decision, b: Decision) => b.updatedAt.localeCompare(a.updatedAt));
	const lines = matches.slice(0, 25).map((decision: Decision) => renderDecision(decision));
	ctx.ui.notify(lines.join("\n"), "info");
}
