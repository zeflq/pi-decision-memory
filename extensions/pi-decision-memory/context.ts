import type { BeforeAgentStartEvent } from "@mariozechner/pi-coding-agent";

import type { DecisionMemoryState } from "./types.js";

const MAX_DECISIONS_HARD = 20;
const MAX_CHARS_PER_DECISION = 160;
const MAX_SECTION_CHARS = 2200;

function truncate(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function buildDecisionLine(id: string, title: string, text: string, tags: string[]): string {
	const shortText = truncate(title.trim().length > 0 ? title.trim() : text.trim(), MAX_CHARS_PER_DECISION);
	const compactTags = tags
		.slice(0, 2)
		.map((tag) => `#${truncate(tag, 12)}`)
		.join(" ");
	return compactTags.length > 0 ? `${id} | ${shortText} | ${compactTags}` : `${id} | ${shortText}`;
}

export function buildContextInjection(
	event: BeforeAgentStartEvent,
	state: DecisionMemoryState,
): { systemPrompt: string } | undefined {
	if (!state.ready || !state.config.enabled) {
		return undefined;
	}

	const activeIds = Array.from(state.indexes.byStatus.get("active") ?? []);
	if (activeIds.length === 0) {
		return undefined;
	}

	const maxDecisions = Math.min(state.config.context.maxDecisions, MAX_DECISIONS_HARD);
	const lines: string[] = [];
	for (const id of activeIds.slice(-maxDecisions)) {
		const decision = state.indexes.byId.get(id);
		if (!decision) continue;
		lines.push(buildDecisionLine(decision.id, decision.title, decision.text, decision.tags));
	}

	const body = lines.join("\n");
	const section = truncate(`Active project decisions:\n${body}`, MAX_SECTION_CHARS);

	return {
		systemPrompt: `${event.systemPrompt}\n\n${section}`,
	};
}
