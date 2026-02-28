import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getDefaultConfig, loadEffectiveConfig } from "../extensions/pi-decision-memory/config.js";
import { buildContextInjection } from "../extensions/pi-decision-memory/context.js";
import type { DecisionMemoryState } from "../extensions/pi-decision-memory/types.js";

function createState(overrides?: Partial<DecisionMemoryState>): DecisionMemoryState {
	return {
		ready: true,
		config: getDefaultConfig(),
		identity: {
			projectRoot: "/tmp/project",
			projectCanonicalPath: "/tmp/project",
			projectHash: "abc123",
		},
		memoryFilePath: "/tmp/memory.jsonl",
		indexes: {
			byId: new Map(),
			byStatus: new Map(),
			byTag: new Map(),
		},
		...overrides,
	};
}

describe("decision memory config", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns defaults when no config files exist", async () => {
		const root = join(tmpdir(), `decision-memory-defaults-${Date.now()}`);
		const home = join(root, "home");
		const projectRoot = join(root, "project");
		mkdirSync(home, { recursive: true });
		mkdirSync(projectRoot, { recursive: true });

		const previousHome = process.env.HOME;
		process.env.HOME = home;
		const config = await loadEffectiveConfig(projectRoot);
		process.env.HOME = previousHome;

		expect(config.enabled).toBe(true);
		expect(config.retentionDays).toEqual({ draft: 30, rejected: 90, superseded: 180 });
		expect(config.context.maxDecisions).toBe(20);
		expect(config.autoCapture).toEqual({ enabled: true, confirm: true, maxPerTurn: 2 });

		rmSync(root, { recursive: true, force: true });
	});

	it("merges global + project and clamps context.maxDecisions", async () => {
		const root = join(tmpdir(), `decision-memory-merge-${Date.now()}`);
		const home = join(root, "home");
		const projectRoot = join(root, "project");
		const globalConfigPath = join(home, ".pi", "agent", "decision-memory.config.json");
		const projectConfigPath = join(projectRoot, ".pi", "decision-memory.config.json");

		mkdirSync(join(home, ".pi", "agent"), { recursive: true });
		mkdirSync(join(projectRoot, ".pi"), { recursive: true });

		writeFileSync(
			globalConfigPath,
			JSON.stringify({
				enabled: true,
				retentionDays: { draft: 10, rejected: 20, superseded: 30 },
				context: { maxDecisions: 99 },
			}),
		);
		writeFileSync(
			projectConfigPath,
			JSON.stringify({
				retentionDays: { draft: 7 },
				context: { maxDecisions: 0 },
			}),
		);

		const previousHome = process.env.HOME;
		process.env.HOME = home;
		const config = await loadEffectiveConfig(projectRoot);
		process.env.HOME = previousHome;

		expect(config.enabled).toBe(true);
		expect(config.retentionDays).toEqual({ draft: 7, rejected: 20, superseded: 30 });
		expect(config.context.maxDecisions).toBe(1);

		rmSync(root, { recursive: true, force: true });
	});

	it("keeps globally disabled state regardless of project config", async () => {
		const root = join(tmpdir(), `decision-memory-disabled-${Date.now()}`);
		const home = join(root, "home");
		const projectRoot = join(root, "project");
		const globalConfigPath = join(home, ".pi", "agent", "decision-memory.config.json");
		const projectConfigPath = join(projectRoot, ".pi", "decision-memory.config.json");

		mkdirSync(join(home, ".pi", "agent"), { recursive: true });
		mkdirSync(join(projectRoot, ".pi"), { recursive: true });

		writeFileSync(globalConfigPath, JSON.stringify({ enabled: false, context: { maxDecisions: 15 } }));
		writeFileSync(projectConfigPath, JSON.stringify({ enabled: true, context: { maxDecisions: 3 } }));

		const previousHome = process.env.HOME;
		process.env.HOME = home;
		const config = await loadEffectiveConfig(projectRoot);
		process.env.HOME = previousHome;

		expect(config.enabled).toBe(false);
		expect(config.context.maxDecisions).toBe(15);

		rmSync(root, { recursive: true, force: true });
	});
});

describe("decision memory context injection", () => {
	it("uses configured maxDecisions and injects active only", () => {
		const state = createState();
		state.config.context.maxDecisions = 2;
		state.indexes.byId.set("D-1", {
			id: "D-1",
			projectId: "p",
			title: "One",
			text: "One text",
			tags: ["db"],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		state.indexes.byId.set("D-2", {
			id: "D-2",
			projectId: "p",
			title: "Two",
			text: "Two text",
			tags: ["api"],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-01-02T00:00:00.000Z",
			updatedAt: "2026-01-02T00:00:00.000Z",
		});
		state.indexes.byId.set("D-3", {
			id: "D-3",
			projectId: "p",
			title: "Three",
			text: "Three text",
			tags: ["ops"],
			status: "active",
			supersedes: null,
			conflictsWith: [],
			createdAt: "2026-01-03T00:00:00.000Z",
			updatedAt: "2026-01-03T00:00:00.000Z",
		});
		state.indexes.byStatus.set("active", new Set(["D-1", "D-2", "D-3"]));

		const result = buildContextInjection(
			{ type: "before_agent_start", systemPrompt: "base", images: [], prompt: "x" },
			state,
		);
		expect(result?.systemPrompt.includes("D-1")).toBe(false);
		expect(result?.systemPrompt.includes("D-2")).toBe(true);
		expect(result?.systemPrompt.includes("D-3")).toBe(true);
	});

	it("returns undefined when disabled", () => {
		const defaults = getDefaultConfig();
		const state = createState({
			config: {
				...defaults,
				enabled: false,
			},
		});
		const result = buildContextInjection(
			{ type: "before_agent_start", systemPrompt: "base", images: [], prompt: "x" },
			state,
		);
		expect(result).toBeUndefined();
	});
});
