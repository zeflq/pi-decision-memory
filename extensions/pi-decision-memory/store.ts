import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { DecisionData, DecisionEvent, DecisionEventCode, DecisionStatus } from "./types.js";

const SUPPORTED_VERSION = 1;

const EVENT_CODES: Record<DecisionEventCode, DecisionEventCode> = {
	a: "a",
	ed: "ed",
	st: "st",
	su: "su",
	rm: "rm",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseStatus(value: unknown): DecisionStatus | undefined {
	if (value === "active" || value === "draft" || value === "rejected" || value === "superseded") {
		return value;
	}
	return undefined;
}

function parseData(value: unknown): DecisionData {
	if (!isRecord(value)) return {};

	const tags = Array.isArray(value.tg)
		? value.tg.filter((item): item is string => typeof item === "string")
		: undefined;
	const conflictsWith = Array.isArray(value.c)
		? value.c.filter((item): item is string => typeof item === "string")
		: undefined;

	return {
		title: typeof value.ti === "string" ? value.ti : undefined,
		text: typeof value.tx === "string" ? value.tx : undefined,
		tags,
		status: parseStatus(value.s),
		reason: typeof value.r === "string" ? value.r : undefined,
		supersedes: typeof value.sp === "string" || value.sp === null ? value.sp : undefined,
		conflictsWith,
	};
}

export function getProjectMemoryFilePath(projectRoot: string): string {
	return path.join(projectRoot, ".pi", "decision-memory", "decisions.jsonl");
}

export function encodeEvent(event: DecisionEvent): string {
	const compact = {
		v: event.v,
		t: event.t,
		p: event.p,
		e: event.e,
		i: event.i,
		d: {
			ti: event.d.title,
			tx: event.d.text,
			tg: event.d.tags,
			s: event.d.status,
			r: event.d.reason,
			sp: event.d.supersedes,
			c: event.d.conflictsWith,
		},
		u: event.u,
	};

	return JSON.stringify(compact);
}

export function decodeEvent(line: string): DecisionEvent | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}

	if (!isRecord(parsed)) return null;
	if (parsed.v !== SUPPORTED_VERSION) return null;
	if (typeof parsed.t !== "string") return null;
	if (typeof parsed.p !== "string") return null;
	if (typeof parsed.i !== "string") return null;
	if (typeof parsed.e !== "string") return null;
	if (!Object.hasOwn(EVENT_CODES, parsed.e)) return null;

	const code = parsed.e as DecisionEventCode;
	const actor = typeof parsed.u === "string" ? parsed.u : undefined;

	return {
		v: SUPPORTED_VERSION,
		t: parsed.t,
		p: parsed.p,
		e: EVENT_CODES[code],
		i: parsed.i,
		d: parseData(parsed.d),
		u: actor,
	};
}

export async function appendEvent(filePath: string, event: DecisionEvent): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	await appendFile(filePath, `${encodeEvent(event)}\n`, "utf8");
}

export async function loadEvents(filePath: string): Promise<DecisionEvent[]> {
	let content: string;
	try {
		content = await readFile(filePath, "utf8");
	} catch {
		return [];
	}

	const lines = content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const events: DecisionEvent[] = [];

	for (const line of lines) {
		const event = decodeEvent(line);
		if (event) {
			events.push(event);
		}
	}

	return events;
}
