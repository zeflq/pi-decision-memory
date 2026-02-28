import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { getDefaultConfig } from "../extensions/pi-decision-memory/config.js";
import type { DecisionMemoryState } from "../extensions/pi-decision-memory/types.js";

export function createState(): DecisionMemoryState {
	return {
		ready: true,
		config: getDefaultConfig(),
		identity: {
			projectRoot: "/tmp/project",
			projectCanonicalPath: "/tmp/project",
			projectHash: "p123",
		},
		memoryFilePath: "/tmp/memory.jsonl",
		indexes: {
			byId: new Map(),
			byStatus: new Map(),
			byTag: new Map(),
		},
	};
}

export function createCommandContext(
	notify: (msg: string, level: "info" | "warning" | "error" | "success") => void,
): ExtensionCommandContext {
	return {
		ui: {
			notify,
		},
	} as unknown as ExtensionCommandContext;
}
