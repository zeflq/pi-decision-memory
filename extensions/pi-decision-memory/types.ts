import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

export type DecisionStatus = "active" | "draft" | "rejected" | "superseded";

export type DecisionEventCode = "a" | "ed" | "st" | "su" | "rm";

export interface DecisionData {
	title?: string;
	text?: string;
	tags?: string[];
	status?: DecisionStatus;
	reason?: string;
	supersedes?: string | null;
	conflictsWith?: string[];
}

export interface DecisionEvent {
	v: 1;
	t: string;
	p: string;
	e: DecisionEventCode;
	i: string;
	d: DecisionData;
	u?: string;
}

export interface Decision {
	id: string;
	projectId: string;
	title: string;
	text: string;
	tags: string[];
	status: DecisionStatus;
	supersedes: string | null;
	conflictsWith: string[];
	reason?: string;
	createdAt: string;
	updatedAt: string;
	createdBy?: string;
}

export interface RetentionDays {
	draft: number;
	rejected: number;
	superseded: number;
}

export interface DecisionContextConfig {
	maxDecisions: number;
}

export interface DecisionAutoCaptureConfig {
	enabled: boolean;
	confirm: boolean;
	maxPerTurn: number;
}

export interface DecisionMemoryConfig {
	enabled: boolean;
	retentionDays: RetentionDays;
	context: DecisionContextConfig;
	autoCapture: DecisionAutoCaptureConfig;
}

export interface ProjectIdentity {
	projectRoot: string;
	projectCanonicalPath: string;
	projectHash: string;
}

export interface DecisionIndexes {
	byId: Map<string, Decision>;
	byStatus: Map<DecisionStatus, Set<string>>;
	byTag: Map<string, Set<string>>;
}

export interface DecisionMemoryState {
	ready: boolean;
	config: DecisionMemoryConfig;
	identity: ProjectIdentity | null;
	memoryFilePath: string | null;
	indexes: DecisionIndexes;
}

export interface DecisionCommandDeps {
	state: DecisionMemoryState;
	appendEvent: (event: DecisionEvent) => Promise<void>;
	setEnabledGlobal?: (enabled: boolean) => Promise<boolean>;
	setEnabledProject?: (enabled: boolean) => Promise<boolean>;
}

export type DecisionCommandHandler = (
	args: string,
	ctx: ExtensionCommandContext,
	deps: DecisionCommandDeps,
) => Promise<void>;
