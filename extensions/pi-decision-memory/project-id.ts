import { createHash } from "node:crypto";
import path from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { ProjectIdentity } from "./types.js";

function normalizeProjectPath(projectPath: string): string {
	return path.resolve(projectPath).replace(/\\/g, "/");
}

function hashProjectPath(projectPath: string): string {
	return createHash("sha1").update(projectPath).digest("hex").slice(0, 16);
}

export async function resolveProjectIdentity(pi: ExtensionAPI, cwd: string): Promise<ProjectIdentity> {
	const gitRoot = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
	const projectRoot = gitRoot.code === 0 && gitRoot.stdout.trim().length > 0 ? gitRoot.stdout.trim() : cwd;
	const projectCanonicalPath = normalizeProjectPath(projectRoot);
	const projectHash = hashProjectPath(projectCanonicalPath);

	return {
		projectRoot,
		projectCanonicalPath,
		projectHash,
	};
}
