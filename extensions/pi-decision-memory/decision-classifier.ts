import { normalizeText } from "./commands/command-utils.js";

export type DecisionCandidateCategory = "architecture" | "tooling" | "policy" | "data" | "quality" | "workflow";

export interface DecisionCandidateClassification {
	isDecision: boolean;
	normalizedText: string;
	confidence: number;
	category: DecisionCandidateCategory;
	reason: string;
	source: "rule" | "llm";
}

const transientPatterns = [
	/^create\b/i,
	/^run\b/i,
	/^fix\b/i,
	/^update\b/i,
	/^implement\b.*\bnow\b/i,
	/^do\b.*\btoday\b/i,
	/^what\b/i,
	/^can you\b/i,
];

const durablePatterns: Array<{ pattern: RegExp; category: DecisionCandidateCategory; confidence: number; reason: string }> = [
	{ pattern: /\b(clean architecture|hexagonal|ddd|cqrs)\b/i, category: "architecture", confidence: 0.92, reason: "architecture choice" },
	{ pattern: /\b(use|adopt|standardize|prefer|choose|we will use)\b.*\b(react|tailwind|postgres|redis|mysql|prisma|typeorm)\b/i, category: "tooling", confidence: 0.88, reason: "stack/tooling directive" },
	{ pattern: /\b(do not|don't|never|must not|avoid)\b/i, category: "policy", confidence: 0.86, reason: "explicit prohibition/policy" },
	{ pattern: /\b(convention|guideline|policy|rule|standard)\b/i, category: "policy", confidence: 0.8, reason: "project policy wording" },
	{ pattern: /\b(table|schema|database|model)\b/i, category: "data", confidence: 0.74, reason: "data design decision" },
	{ pattern: /\b(clean code|testability|maintainability|quality)\b/i, category: "quality", confidence: 0.76, reason: "quality standard" },
];

function ensureSentence(text: string): string {
	const trimmed = text.trim();
	if (trimmed.length === 0) return "";
	return trimmed[0].toUpperCase() + trimmed.slice(1);
}

export function classifyDecisionCandidate(line: string): DecisionCandidateClassification {
	const cleaned = ensureSentence(line.replace(/^\s*(?:[-*]\s*)?/, ""));
	if (cleaned.length < 8) {
		return {
			isDecision: false,
			normalizedText: cleaned,
			confidence: 0.1,
			category: "workflow",
			reason: "too short",
			source: "rule",
		};
	}

	for (const pattern of transientPatterns) {
		if (pattern.test(cleaned)) {
			return {
				isDecision: false,
				normalizedText: cleaned,
				confidence: 0.2,
				category: "workflow",
				reason: "transient instruction",
				source: "rule",
			};
		}
	}

	for (const candidate of durablePatterns) {
		if (candidate.pattern.test(cleaned)) {
			return {
				isDecision: true,
				normalizedText: cleaned,
				confidence: candidate.confidence,
				category: candidate.category,
				reason: candidate.reason,
				source: "rule",
			};
		}
	}

	const normalized = normalizeText(cleaned);
	if (/\b(we will|must|should|always|never)\b/i.test(cleaned)) {
		return {
			isDecision: true,
			normalizedText: cleaned,
			confidence: 0.68,
			category: "workflow",
			reason: "directive statement",
			source: "rule",
		};
	}

	return {
		isDecision: false,
		normalizedText: cleaned,
		confidence: normalized.length > 40 ? 0.35 : 0.15,
		category: "workflow",
		reason: "low confidence",
		source: "rule",
	};
}
