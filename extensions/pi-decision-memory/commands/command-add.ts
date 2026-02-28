import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { createAddEvent, normalizeText, persistAndApply } from "./command-utils.js";
import type { Decision, DecisionCommandDeps, DecisionEvent } from "../types.js";

function normalizeDecisionText(text: string): string {
	return normalizeText(text).replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function hasNegation(text: string): boolean {
	return /\b(no|not|never|avoid|don't|do not|must not|should not|cannot|can't)\b/i.test(text);
}

function toKeywords(text: string): Set<string> {
	const stop = new Set(["the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "with", "as", "is", "are"]);
	const words = normalizeDecisionText(text)
		.split(" ")
		.map((w) => w.trim())
		.filter((w) => w.length > 2 && !stop.has(w));
	return new Set(words);
}

function hasKeywordOverlap(a: string, b: string): boolean {
	const aKeys = toKeywords(a);
	const bKeys = toKeywords(b);
	for (const key of aKeys) {
		if (bKeys.has(key)) return true;
	}
	return false;
}

function findActiveDuplicate(text: string, deps: DecisionCommandDeps): Decision | null {
	const normalized = normalizeDecisionText(text);
	const activeIds = deps.state.indexes.byStatus.get("active") ?? new Set<string>();
	for (const id of activeIds) {
		const decision = deps.state.indexes.byId.get(id);
		if (!decision) continue;
		const source = decision.text.trim().length > 0 ? decision.text : decision.title;
		if (normalizeDecisionText(source) === normalized) {
			return decision;
		}
	}
	return null;
}

function findActiveConflicts(text: string, deps: DecisionCommandDeps): Decision[] {
	const conflicts: Decision[] = [];
	const newHasNegation = hasNegation(text);
	const activeIds = deps.state.indexes.byStatus.get("active") ?? new Set<string>();

	for (const id of activeIds) {
		const decision = deps.state.indexes.byId.get(id);
		if (!decision) continue;
		const existingText = decision.text.trim().length > 0 ? decision.text : decision.title;
		if (!hasKeywordOverlap(text, existingText)) continue;
		if (newHasNegation !== hasNegation(existingText)) {
			conflicts.push(decision);
		}
	}

	return conflicts;
}

async function updateExistingDecision(
	existing: Decision,
	text: string,
	deps: DecisionCommandDeps,
): Promise<DecisionEvent> {
	const event: DecisionEvent = {
		v: 1,
		t: new Date().toISOString(),
		p: existing.projectId,
		e: "ed",
		i: existing.id,
		d: {
			title: text.slice(0, 80),
			text,
		},
		u: "user",
	};
	await persistAndApply(event, deps);
	return event;
}

export async function handleAdd(rest: string, ctx: ExtensionCommandContext, deps: DecisionCommandDeps): Promise<void> {
	if (rest.length === 0) {
		ctx.ui.notify("Usage: /decision add <text>", "warning");
		return;
	}

	const text = rest.trim();

	const duplicate = findActiveDuplicate(text, deps);
	if (duplicate) {
		if (!ctx.hasUI || !ctx.ui.select) {
			ctx.ui.notify(`Duplicate active decision: ${duplicate.id}. Use /decision edit or retry with UI.`, "warning");
			return;
		}

		const choice = await ctx.ui.select("Duplicate decision detected", ["Update existing", "Force create", "Cancel"]);
		if (choice === "Update existing") {
			await updateExistingDecision(duplicate, text, deps);
			ctx.ui.notify(`Updated existing decision ${duplicate.id}`, "info");
			return;
		}
		if (choice !== "Force create") {
			ctx.ui.notify("Add cancelled.", "info");
			return;
		}
	}

	const conflicts = findActiveConflicts(text, deps);
	if (conflicts.length > 0) {
		if (!ctx.hasUI || !ctx.ui.select) {
			ctx.ui.notify(`Conflicts with active decision(s): ${conflicts.map((c) => c.id).join(", ")}. Cancelled.`, "warning");
			return;
		}

		const choice = await ctx.ui.select("Conflicting active decision detected", [
			"Supersede first conflict",
			"Keep both and mark conflict",
			"Cancel",
		]);

		if (choice === "Cancel" || !choice) {
			ctx.ui.notify("Add cancelled.", "info");
			return;
		}

		if (choice === "Supersede first conflict") {
			const target = conflicts[0];
			const now = new Date();
			const supersedeEvent: DecisionEvent = {
				v: 1,
				t: now.toISOString(),
				p: target.projectId,
				e: "st",
				i: target.id,
				d: { status: "superseded", reason: "Superseded by conflicting new decision" },
				u: "user",
			};
			await persistAndApply(supersedeEvent, deps);

			const replacement = createAddEvent(deps, text, new Date(now.getTime() + 1), target.id);
			if (!replacement) {
				ctx.ui.notify("Project identity is not ready yet. Try again.", "warning");
				return;
			}
			await persistAndApply(replacement, deps);
			ctx.ui.notify(`Added decision ${replacement.i} (supersedes ${target.id})`, "info");
			return;
		}

		if (choice === "Keep both and mark conflict") {
			const event = createAddEvent(deps, text, new Date());
			if (!event) {
				ctx.ui.notify("Project identity is not ready yet. Try again.", "warning");
				return;
			}
			event.d.conflictsWith = conflicts.map((c) => c.id);
			await persistAndApply(event, deps);
			ctx.ui.notify(`Added decision ${event.i} with conflict marker`, "info");
			return;
		}
	}

	const now = new Date();
	const event = createAddEvent(deps, text, now);
	if (!event) {
		ctx.ui.notify("Project identity is not ready yet. Try again.", "warning");
		return;
	}

	await persistAndApply(event, deps);
	ctx.ui.notify(`Added decision ${event.i}`, "info");
}
