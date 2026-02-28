import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { createAddEvent, normalizeText, persistAndApply } from "./commands/command-utils.js";
import { classifyDecisionCandidate, type DecisionCandidateClassification } from "./decision-classifier.js";
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
			/^(?:[-*]\s*)?(?:use|adopt|build|implement|enforce|standardize|avoid|do not|don't|never|must|should|please use|please avoid|we will|in this project we will|for this project we will)\b/i.test(
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

const DECISION_CONFIDENCE_THRESHOLD = 0.65;

function normalizeUnique(values: DecisionCandidateClassification[]): DecisionCandidateClassification[] {
	const seen = new Set<string>();
	const unique: DecisionCandidateClassification[] = [];
	for (const value of values) {
		const normalized = normalizeText(value.normalizedText);
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
	const classified = rawCandidates
		.map((candidate) => classifyDecisionCandidate(candidate))
		.filter((candidate) => candidate.isDecision)
		.filter((candidate) => candidate.confidence >= DECISION_CONFIDENCE_THRESHOLD)
		.filter((candidate) => !isDuplicateActiveDecision(candidate.normalizedText, deps));
	deps.state.pendingAutoCaptureCandidates = normalizeUnique(classified);
}

async function selectCandidatesToCapture(
	candidates: DecisionCandidateClassification[],
	ctx: ExtensionContext,
	deps: DecisionCommandDeps,
): Promise<DecisionCandidateClassification[]> {
	if (candidates.length === 0) return [];
	if (!deps.state.config.autoCapture.confirm || !ctx.hasUI) return candidates;

	try {
		const remaining = [...candidates];
		const selected: DecisionCandidateClassification[] = [];
		while (remaining.length > 0) {
			const labels = remaining.map(
				(candidate) => `${candidate.normalizedText} (${candidate.category}, ${Math.round(candidate.confidence * 100)}%)`,
			);
			const choice = await ctx.ui.select("Auto-capture decisions", [...labels, "Done"]);
			if (!choice || choice === "Done") break;
			const chosenIndex = labels.indexOf(choice);
			if (chosenIndex < 0) break;
			selected.push(remaining[chosenIndex]);
			remaining.splice(chosenIndex, 1);
		}
		return selected;
	} catch {
		const selected: DecisionCandidateClassification[] = [];
		for (const candidate of candidates) {
			const ok = await ctx.ui.confirm(
				"Auto-capture decision",
				`Add decision?\n\n${candidate.normalizedText}\n\n(${candidate.category}, ${Math.round(candidate.confidence * 100)}%)`,
			);
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
		if (isDuplicateActiveDecision(candidate.normalizedText, deps)) continue;
		const event = createAddEvent(deps, candidate.normalizedText, new Date(), undefined, {
			source: "auto-rule-classifier",
			confidence: candidate.confidence,
			category: candidate.category,
			reason: candidate.reason,
		});
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
