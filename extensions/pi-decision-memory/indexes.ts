import type { Decision, DecisionEvent, DecisionIndexes, DecisionStatus } from "./types.js";

function createEmptyIndexes(): DecisionIndexes {
	return {
		byId: new Map<string, Decision>(),
		byStatus: new Map<DecisionStatus, Set<string>>(),
		byTag: new Map<string, Set<string>>(),
	};
}

function indexDecision(indexes: DecisionIndexes, decision: Decision): void {
	if (!indexes.byStatus.has(decision.status)) {
		indexes.byStatus.set(decision.status, new Set<string>());
	}
	indexes.byStatus.get(decision.status)?.add(decision.id);

	for (const tag of decision.tags) {
		if (!indexes.byTag.has(tag)) {
			indexes.byTag.set(tag, new Set<string>());
		}
		indexes.byTag.get(tag)?.add(decision.id);
	}
}

function removeDecisionFromIndexes(indexes: DecisionIndexes, decision: Decision): void {
	indexes.byStatus.get(decision.status)?.delete(decision.id);
	for (const tag of decision.tags) {
		indexes.byTag.get(tag)?.delete(decision.id);
	}
}

export function applyEventToIndexes(indexes: DecisionIndexes, event: DecisionEvent): void {
	if (event.e === "a") {
		const created: Decision = {
			id: event.i,
			projectId: event.p,
			title: event.d.title ?? "",
			text: event.d.text ?? "",
			tags: event.d.tags ?? [],
			status: event.d.status ?? "active",
			supersedes: event.d.supersedes ?? null,
			conflictsWith: event.d.conflictsWith ?? [],
			reason: event.d.reason,
			createdAt: event.t,
			updatedAt: event.t,
			createdBy: event.u,
		};
		indexes.byId.set(created.id, created);
		indexDecision(indexes, created);
		return;
	}

	const existing = indexes.byId.get(event.i);
	if (!existing) {
		return;
	}

	if (event.e === "rm") {
		removeDecisionFromIndexes(indexes, existing);
		indexes.byId.delete(existing.id);
		return;
	}

	removeDecisionFromIndexes(indexes, existing);

	existing.title = event.d.title ?? existing.title;
	existing.text = event.d.text ?? existing.text;
	existing.tags = event.d.tags ?? existing.tags;
	existing.status = event.d.status ?? existing.status;
	existing.reason = event.d.reason ?? existing.reason;
	existing.supersedes = event.d.supersedes ?? existing.supersedes;
	existing.conflictsWith = event.d.conflictsWith ?? existing.conflictsWith;
	existing.updatedAt = event.t;

	indexDecision(indexes, existing);
}

export function buildIndexes(events: DecisionEvent[]): DecisionIndexes {
	const indexes = createEmptyIndexes();
	for (const event of events) {
		applyEventToIndexes(indexes, event);
	}
	return indexes;
}
