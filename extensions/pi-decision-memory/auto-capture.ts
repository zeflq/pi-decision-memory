import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { createAddEvent, normalizeText, persistAndApply } from "./commands/command-utils.js";
import type { Decision, DecisionCommandDeps } from "./types.js";

function extractExplicitDecisionLines(prompt: string, max: number): string[] {
	const lines = prompt.split("\n");
	const extracted: string[] = [];

	for (const line of lines) {
		const match = line.match(/^\s*decision\s*:\s*(.+)\s*$/i);
		if (!match) continue;
		const decisionText = match[1].trim();
		if (decisionText.length === 0) continue;
		extracted.push(decisionText);
		if (extracted.length >= max) break;
	}

	return extracted;
}

function isDuplicateActiveDecision(text: string, deps: DecisionCommandDeps): boolean {
	const normalized = normalizeText(text);
	const activeIds = deps.state.indexes.byStatus.get("active") ?? new Set<string>();
	for (const id of activeIds) {
		const existing = deps.state.indexes.byId.get(id);
		if (!existing) continue;
		const existingText = normalizeText(existing.text.trim().length > 0 ? existing.text : existing.title);
		if (existingText === normalized) return true;
	}
	return false;
}

async function maybeConfirmCapture(
	candidate: string,
	ctx: ExtensionContext,
	deps: DecisionCommandDeps,
): Promise<boolean> {
	if (!deps.state.config.autoCapture.confirm || !ctx.hasUI) {
		return true;
	}
	return ctx.ui.confirm("Auto-capture decision", `Add decision?\n\n${candidate}`);
}

export async function autoCaptureDecisionsFromUserPrompt(
	prompt: string,
	ctx: ExtensionContext,
	deps: DecisionCommandDeps,
): Promise<void> {
	if (!deps.state.ready || !deps.state.config.enabled) return;
	if (!deps.state.config.autoCapture.enabled) return;
	if (prompt.trim().length === 0) return;

	const candidates = extractExplicitDecisionLines(prompt, deps.state.config.autoCapture.maxPerTurn);
	for (const candidate of candidates) {
		if (isDuplicateActiveDecision(candidate, deps)) continue;
		const shouldCapture = await maybeConfirmCapture(candidate, ctx, deps);
		if (!shouldCapture) continue;

		const event = createAddEvent(deps, candidate, new Date());
		if (!event) return;

		await persistAndApply(event, deps);
		if (ctx.hasUI) {
			ctx.ui.notify(`Auto-captured decision ${event.i}`, "info");
		}
	}
}

export function findActiveDecisionByText(text: string, deps: DecisionCommandDeps): Decision | null {
	const normalized = normalizeText(text);
	const activeIds = deps.state.indexes.byStatus.get("active") ?? new Set<string>();
	for (const id of activeIds) {
		const existing = deps.state.indexes.byId.get(id);
		if (!existing) continue;
		const existingText = normalizeText(existing.text.trim().length > 0 ? existing.text : existing.title);
		if (existingText === normalized) return existing;
	}
	return null;
}
