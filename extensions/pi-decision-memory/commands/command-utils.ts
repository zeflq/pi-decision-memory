import { applyEventToIndexes } from "../indexes.js";
import type { Decision, DecisionCommandDeps, DecisionEvent } from "../types.js";

export function commandUsage(): string {
	return [
		"Usage:",
		"  /decision help",
		"  /decision status",
		"  /decision add <text>",
		"  /decision list",
		"  /decision search <query>",
		"  /decision edit <id> <text>",
		"  /decision remove <id>",
		"  /decision supersede <oldId> <newText>",
		"  /decision purge",
		"  /decision reset [--yes] (alias: clear)",
		"  /decision enable --global|--project",
		"  /decision disable --global|--project",
	].join("\n");
}

export function isMutatingCommand(subcommand: string): boolean {
	return (
		subcommand === "add" ||
		subcommand === "edit" ||
		subcommand === "remove" ||
		subcommand === "supersede" ||
		subcommand === "purge" ||
		subcommand === "reset" ||
		subcommand === "clear"
	);
}

export function splitSubcommand(input: string): { subcommand: string; rest: string } {
	const firstSpace = input.indexOf(" ");
	if (firstSpace === -1) {
		return { subcommand: input, rest: "" };
	}

	return {
		subcommand: input.slice(0, firstSpace),
		rest: input.slice(firstSpace + 1).trim(),
	};
}

export function splitIdAndText(input: string): { id: string; text: string } | null {
	const firstSpace = input.indexOf(" ");
	if (firstSpace === -1) return null;
	const id = input.slice(0, firstSpace).trim();
	const text = input.slice(firstSpace + 1).trim();
	if (id.length === 0 || text.length === 0) return null;
	return { id, text };
}

export function parseToggleScope(input: string): "global" | "project" | null {
	const value = input.trim();
	if (value === "--global") return "global";
	if (value === "--project") return "project";
	return null;
}

export function renderDecision(decision: Decision): string {
	const text = decision.text.trim().length > 0 ? decision.text.trim() : decision.title.trim();
	const shortText = text.length > 120 ? `${text.slice(0, 119)}…` : text;
	const tags = decision.tags
		.slice(0, 2)
		.map((tag: string) => `#${tag}`)
		.join(" ");
	const tagsPart = tags.length > 0 ? ` | ${tags}` : "";
	return `${decision.id} | ${decision.status} | ${shortText}${tagsPart}`;
}

export function normalizeText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function nextDecisionId(existingIds: Iterable<string>, now: Date): string {
	const y = now.getUTCFullYear();
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	const d = String(now.getUTCDate()).padStart(2, "0");
	const dayPrefix = `D-${y}-${m}-${d}-`;

	let maxForDay = 0;
	for (const id of existingIds) {
		if (!id.startsWith(dayPrefix)) continue;
		const suffix = Number.parseInt(id.slice(dayPrefix.length), 10);
		if (Number.isFinite(suffix) && suffix > maxForDay) {
			maxForDay = suffix;
		}
	}

	return `${dayPrefix}${String(maxForDay + 1).padStart(4, "0")}`;
}

export function createAddEvent(
	deps: DecisionCommandDeps,
	text: string,
	now: Date,
	supersedes?: string,
	meta?: { source?: string; confidence?: number; category?: string; reason?: string },
): DecisionEvent | null {
	const identity = deps.state.identity;
	if (!identity) {
		return null;
	}

	const id = nextDecisionId(deps.state.indexes.byId.keys(), now);
	return {
		v: 1,
		t: now.toISOString(),
		p: identity.projectHash,
		e: "a",
		i: id,
		d: {
			title: text.slice(0, 80),
			text,
			status: "active",
			tags: [],
			conflictsWith: [],
			supersedes: supersedes ?? null,
			source: meta?.source,
			confidence: meta?.confidence,
			category: meta?.category,
			reason: meta?.reason,
		},
		u: "user",
	};
}

export async function persistAndApply(event: DecisionEvent, deps: DecisionCommandDeps): Promise<void> {
	await deps.appendEvent(event);
	applyEventToIndexes(deps.state.indexes, event);
}
