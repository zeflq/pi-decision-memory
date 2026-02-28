import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { DecisionCandidateClassification } from "./decision-classifier.js";

const SYSTEM_PROMPT = `You classify whether a line is a durable project decision.
Return ONLY valid JSON with keys:
- isDecision: boolean
- normalizedText: string
- confidence: number (0..1)
- category: one of architecture|tooling|policy|data|quality|workflow
- reason: short string

Mark isDecision=true only for durable rules/choices that should guide future work across tasks.
Mark isDecision=false for one-off execution instructions (e.g. create file, run tests, update route now).
`;

function extractJsonObject(text: string): string | null {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end < 0 || end <= start) return null;
	return text.slice(start, end + 1);
}

export async function classifyDecisionCandidateWithLLM(
	line: string,
	ctx: ExtensionContext,
): Promise<DecisionCandidateClassification | null> {
	if (!ctx.model) return null;
	const modelRegistry = (ctx as ExtensionContext).modelRegistry;
	if (!modelRegistry || typeof modelRegistry.getApiKey !== "function") return null;

	const apiKey = await modelRegistry.getApiKey(ctx.model);
	if (!apiKey) return null;

	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: line }],
		timestamp: Date.now(),
	};

	const response = await complete(
		ctx.model,
		{ systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
		{ apiKey },
	);

	const text = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();
	const jsonText = extractJsonObject(text);
	if (!jsonText) return null;

	try {
		const parsed = JSON.parse(jsonText) as {
			isDecision?: boolean;
			normalizedText?: string;
			confidence?: number;
			category?: DecisionCandidateClassification["category"];
			reason?: string;
		};
		if (typeof parsed.isDecision !== "boolean") return null;
		if (typeof parsed.normalizedText !== "string") return null;
		if (typeof parsed.confidence !== "number") return null;
		if (typeof parsed.reason !== "string") return null;
		if (
			parsed.category !== "architecture" &&
			parsed.category !== "tooling" &&
			parsed.category !== "policy" &&
			parsed.category !== "data" &&
			parsed.category !== "quality" &&
			parsed.category !== "workflow"
		)
			return null;

		return {
			isDecision: parsed.isDecision,
			normalizedText: parsed.normalizedText.trim(),
			confidence: Math.max(0, Math.min(1, parsed.confidence)),
			category: parsed.category,
			reason: parsed.reason.trim(),
			source: "llm",
		};
	} catch {
		return null;
	}
}
