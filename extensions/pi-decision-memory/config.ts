import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
	DecisionAutoCaptureConfig,
	DecisionContextConfig,
	DecisionMemoryConfig,
	RetentionDays,
} from "./types.js";

type PartialDecisionMemoryConfig = {
	enabled?: boolean;
	retentionDays?: Partial<RetentionDays>;
	context?: Partial<DecisionContextConfig>;
	autoCapture?: Partial<DecisionAutoCaptureConfig>;
};

const DEFAULT_RETENTION_DAYS: RetentionDays = {
	draft: 30,
	rejected: 90,
	superseded: 180,
};

const DEFAULT_CONTEXT_CONFIG: DecisionContextConfig = {
	maxDecisions: 20,
};

const DEFAULT_AUTO_CAPTURE_CONFIG: DecisionAutoCaptureConfig = {
	enabled: true,
	confirm: true,
	maxPerTurn: 2,
};

const MIN_MAX_DECISIONS = 1;
const MAX_MAX_DECISIONS = 20;
const MIN_AUTO_CAPTURE_PER_TURN = 1;
const MAX_AUTO_CAPTURE_PER_TURN = 5;

function createDefaultConfig(): DecisionMemoryConfig {
	return {
		enabled: true,
		retentionDays: {
			draft: DEFAULT_RETENTION_DAYS.draft,
			rejected: DEFAULT_RETENTION_DAYS.rejected,
			superseded: DEFAULT_RETENTION_DAYS.superseded,
		},
		context: {
			maxDecisions: DEFAULT_CONTEXT_CONFIG.maxDecisions,
		},
		autoCapture: {
			enabled: DEFAULT_AUTO_CAPTURE_CONFIG.enabled,
			confirm: DEFAULT_AUTO_CAPTURE_CONFIG.confirm,
			maxPerTurn: DEFAULT_AUTO_CAPTURE_CONFIG.maxPerTurn,
		},
	};
}

export const DEFAULT_CONFIG: DecisionMemoryConfig = createDefaultConfig();

export function getDefaultConfig(): DecisionMemoryConfig {
	return createDefaultConfig();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function parseContextConfig(raw: unknown): Partial<DecisionContextConfig> {
	if (!isRecord(raw)) return {};
	if (typeof raw.maxDecisions !== "number") return {};

	return {
		maxDecisions: clampNumber(Math.floor(raw.maxDecisions), MIN_MAX_DECISIONS, MAX_MAX_DECISIONS),
	};
}

function parseAutoCaptureConfig(raw: unknown): Partial<DecisionAutoCaptureConfig> {
	if (!isRecord(raw)) return {};

	return {
		enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
		confirm: typeof raw.confirm === "boolean" ? raw.confirm : undefined,
		maxPerTurn:
			typeof raw.maxPerTurn === "number"
				? clampNumber(Math.floor(raw.maxPerTurn), MIN_AUTO_CAPTURE_PER_TURN, MAX_AUTO_CAPTURE_PER_TURN)
				: undefined,
	};
}

function parsePartialConfig(raw: unknown): PartialDecisionMemoryConfig {
	if (!isRecord(raw)) return {};

	const enabled = typeof raw.enabled === "boolean" ? raw.enabled : undefined;
	let retentionDays: Partial<RetentionDays> | undefined;

	if (isRecord(raw.retentionDays)) {
		retentionDays = {
			draft: typeof raw.retentionDays.draft === "number" ? raw.retentionDays.draft : undefined,
			rejected: typeof raw.retentionDays.rejected === "number" ? raw.retentionDays.rejected : undefined,
			superseded: typeof raw.retentionDays.superseded === "number" ? raw.retentionDays.superseded : undefined,
		};
	}

	return {
		enabled,
		retentionDays,
		context: parseContextConfig(raw.context),
		autoCapture: parseAutoCaptureConfig(raw.autoCapture),
	};
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function loadRawConfig(filePath: string): Promise<Record<string, unknown>> {
	if (!(await fileExists(filePath))) {
		return {};
	}

	try {
		const content = await readFile(filePath, "utf8");
		const parsed: unknown = JSON.parse(content);
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

async function loadPartialConfig(filePath: string): Promise<PartialDecisionMemoryConfig> {
	const raw = await loadRawConfig(filePath);
	return parsePartialConfig(raw);
}

async function writeRawConfig(filePath: string, raw: Record<string, unknown>): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
}

function mergeConfig(base: DecisionMemoryConfig, override: PartialDecisionMemoryConfig): DecisionMemoryConfig {
	return {
		enabled: override.enabled ?? base.enabled,
		retentionDays: {
			draft: override.retentionDays?.draft ?? base.retentionDays.draft,
			rejected: override.retentionDays?.rejected ?? base.retentionDays.rejected,
			superseded: override.retentionDays?.superseded ?? base.retentionDays.superseded,
		},
		context: {
			maxDecisions: override.context?.maxDecisions ?? base.context.maxDecisions,
		},
		autoCapture: {
			enabled: override.autoCapture?.enabled ?? base.autoCapture.enabled,
			confirm: override.autoCapture?.confirm ?? base.autoCapture.confirm,
			maxPerTurn: override.autoCapture?.maxPerTurn ?? base.autoCapture.maxPerTurn,
		},
	};
}

export function getGlobalConfigPath(): string {
	return path.join(os.homedir(), ".pi", "agent", "decision-memory.config.json");
}

export function getProjectConfigPath(projectRoot: string): string {
	return path.join(projectRoot, ".pi", "decision-memory.config.json");
}

export async function setEnabledInConfig(configPath: string, enabled: boolean): Promise<void> {
	const raw = await loadRawConfig(configPath);
	raw.enabled = enabled;
	await writeRawConfig(configPath, raw);
}

export async function loadEffectiveConfig(projectRoot: string): Promise<DecisionMemoryConfig> {
	const globalConfig = await loadPartialConfig(getGlobalConfigPath());
	const projectConfig = await loadPartialConfig(getProjectConfigPath(projectRoot));

	const mergedGlobal = mergeConfig(DEFAULT_CONFIG, globalConfig);
	if (mergedGlobal.enabled === false) {
		return mergedGlobal;
	}

	return mergeConfig(mergedGlobal, projectConfig);
}
