import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { createAddEvent, normalizeText, persistAndApply } from "./commands/command-utils.js";
import type { Decision, DecisionCommandDeps } from "./types.js";

function cleanCandidate(text: string): string {
	return text.replace(/^[-*\s]+/, "").trim();
}

function extractDecisionLikeCandidates(prompt: string, max: number): string[] {
	const lines = prompt
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.filter((line) => line.length <= 220)
		.filter((line) => !line.endsWith("?"));

	const candidates: string[] = [];
	for (const line of lines) {
		const explicit = line.match(/^decision\s*:\s*(.+)$/i);
		if (explicit) {
			const text = cleanCandidate(explicit[1] ?? "");
			if (text.length > 0) candidates.push(text);
			if (candidates.length >= max) break;
			continue;
		}

		if (
			/^(?:[-*]\s*)?(?:use|adopt|build|implement|enforce|standardize|avoid|do not|don't|never|must|should|please use|please avoid)\b/i.test(
				line,
			)
		) {
			const text = cleanCandidate(line);
			if (text.length > 0) candidates.push(text);
			if (candidates.length >= max) break;
		}
	}

	return candidates;
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

function normalizeUnique(values: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const value of values) {
		const normalized = normalizeText(value);
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		unique.push(value);
	}
	return unique;
}

function shouldSkipCaptureAfterRun(messages: AgentMessage[]): boolean {
	const assistant = messages.filter((message) => message.role === "assistant").at(-1) as
		| (AgentMessage & { stopReason?: string })
		| undefined;
	if (!assistant) return false;
	return assistant.stopReason === "error" || assistant.stopReason === "aborted";
}

export function preparePendingAutoCaptureFromPrompt(prompt: string, deps: DecisionCommandDeps): void {
	deps.state.pendingAutoCaptureCandidates = [];
	if (!deps.state.ready || !deps.state.config.enabled) return;
	if (!deps.state.config.autoCapture.enabled) return;
	if (prompt.trim().length === 0) return;

	const rawCandidates = extractDecisionLikeCandidates(prompt, deps.state.config.autoCapture.maxPerTurn);
	const uniqueCandidates = normalizeUnique(rawCandidates).filter((candidate) => !isDuplicateActiveDecision(candidate, deps));
	deps.state.pendingAutoCaptureCandidates = uniqueCandidates;
}

async function selectCandidatesToCapture(
	candidates: string[],
	ctx: ExtensionContext,
	deps: DecisionCommandDeps,
): Promise<string[]> {
	if (candidates.length === 0) return [];
	if (!deps.state.config.autoCapture.confirm || !ctx.hasUI) return candidates;

	try {
		const remaining = [...candidates];
		const selected: string[] = [];
		while (remaining.length > 0) {
			const choice = await ctx.ui.select("Auto-capture decisions", [...remaining, "Done"]);
			if (!choice || choice === "Done") break;
			selected.push(choice);
			const nextRemaining = remaining.filter((item) => item !== choice);
			remaining.length = 0;
			remaining.push(...nextRemaining);
		}
		return selected;
	} catch {
		const selected: string[] = [];
		for (const candidate of candidates) {
			const ok = await ctx.ui.confirm("Auto-capture decision", `Add decision?\n\n${candidate}`);
			if (ok) selected.push(candidate);
		}
		return selected;
	}
}

export async function finalizePendingAutoCapture(
	messages: AgentMessage[],
	ctx: ExtensionContext,
	deps: DecisionCommandDeps,
): Promise<void> {
	if (!deps.state.ready || !deps.state.config.enabled) {
		deps.state.pendingAutoCaptureCandidates = [];
		return;
	}
	if (!deps.state.config.autoCapture.enabled) {
		deps.state.pendingAutoCaptureCandidates = [];
		return;
	}

	const pending = [...deps.state.pendingAutoCaptureCandidates];
	deps.state.pendingAutoCaptureCandidates = [];
	if (pending.length === 0) return;
	if (shouldSkipCaptureAfterRun(messages)) return;

	const selected = await selectCandidatesToCapture(pending, ctx, deps);
	for (const candidate of selected) {
		if (isDuplicateActiveDecision(candidate, deps)) continue;
		const event = createAddEvent(deps, candidate, new Date());
		if (!event) continue;
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
