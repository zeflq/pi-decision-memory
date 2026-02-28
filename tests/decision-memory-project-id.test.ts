import { describe, expect, it, vi } from "vitest";

import { resolveProjectIdentity } from "../extensions/pi-decision-memory/project-id.js";

describe("decision memory project identity", () => {
	it("uses git root when git rev-parse succeeds", async () => {
		const exec = vi.fn(async () => ({ code: 0, stdout: "/tmp/repo\n", stderr: "" }));
		const pi = { exec };

		const identity = await resolveProjectIdentity(pi as never, "/tmp/repo/subdir");

		expect(exec).toHaveBeenCalledWith("git", ["rev-parse", "--show-toplevel"], { cwd: "/tmp/repo/subdir" });
		expect(identity.projectRoot).toBe("/tmp/repo");
		expect(identity.projectCanonicalPath).toBe("/tmp/repo");
		expect(identity.projectHash).toHaveLength(16);
	});

	it("falls back to cwd when git rev-parse fails", async () => {
		const exec = vi.fn(async () => ({ code: 1, stdout: "", stderr: "not a git repo" }));
		const pi = { exec };

		const identity = await resolveProjectIdentity(pi as never, "/tmp/non-git");

		expect(identity.projectRoot).toBe("/tmp/non-git");
		expect(identity.projectCanonicalPath).toBe("/tmp/non-git");
		expect(identity.projectHash).toHaveLength(16);
	});
});
