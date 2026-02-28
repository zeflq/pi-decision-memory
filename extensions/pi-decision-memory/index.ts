import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { finalizePendingAutoCapture, preparePendingAutoCaptureFromPrompt } from "./auto-capture.js";
import { handleDecisionCommand } from "./commands/index.js";
import {
	getDefaultConfig,
	getGlobalConfigPath,
	getProjectConfigPath,
	loadEffectiveConfig,
	setEnabledInConfig,
} from "./config.js";
import { buildContextInjection } from "./context.js";
import { buildIndexes } from "./indexes.js";
import { resolveProjectIdentity } from "./project-id.js";
import { appendEvent as appendEventToFile, getProjectMemoryFilePath, loadEvents } from "./store.js";
import type { DecisionCommandDeps, DecisionMemoryState } from "./types.js";

function createInitialState(): DecisionMemoryState {
	return {
		ready: false,
		config: getDefaultConfig(),
		identity: null,
		memoryFilePath: null,
		indexes: {
			byId: new Map(),
			byStatus: new Map(),
			byTag: new Map(),
		},
		pendingAutoCaptureCandidates: [],
	};
}

export default function decisionMemoryExtension(pi: ExtensionAPI): void {
	const state = createInitialState();

	pi.on("session_start", async (_event, ctx) => {
		const identity = await resolveProjectIdentity(pi, ctx.cwd);
		const config = await loadEffectiveConfig(identity.projectRoot);
		const memoryFilePath = getProjectMemoryFilePath(identity.projectRoot);
		const events = await loadEvents(memoryFilePath);

		state.identity = identity;
		state.config = config;
		state.memoryFilePath = memoryFilePath;
		state.indexes = buildIndexes(events);
		state.ready = true;
	});

	const deps: DecisionCommandDeps = {
		state,
		appendEvent: async (decisionEvent) => {
			if (!state.memoryFilePath) return;
			await appendEventToFile(state.memoryFilePath, decisionEvent);
		},
		setEnabledGlobal: async (enabled: boolean) => {
			const projectRoot = state.identity?.projectRoot;
			if (!projectRoot) return false;
			await setEnabledInConfig(getGlobalConfigPath(), enabled);
			state.config = await loadEffectiveConfig(projectRoot);
			return true;
		},
		setEnabledProject: async (enabled: boolean) => {
			const projectRoot = state.identity?.projectRoot;
			if (!projectRoot) return false;
			await setEnabledInConfig(getProjectConfigPath(projectRoot), enabled);
			state.config = await loadEffectiveConfig(projectRoot);
			return true;
		},
	};

	pi.on("before_agent_start", async (event) => {
		preparePendingAutoCaptureFromPrompt(event.prompt, deps);
		return buildContextInjection(event, state);
	});

	pi.on("agent_end", async (event, ctx) => {
		await finalizePendingAutoCapture(event.messages, ctx, deps);
	});

	pi.registerCommand("decision", {
		description: "Manage per-project durable decisions",
		handler: async (args, ctx) => {
			await handleDecisionCommand(args, ctx, deps);
		},
	});
}
