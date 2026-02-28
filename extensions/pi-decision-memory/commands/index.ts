import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { handleAdd } from "./command-add.js";
import { handleEdit } from "./command-edit.js";
import { handleList } from "./command-list.js";
import { handlePurge } from "./command-purge.js";
import { handleRemove } from "./command-remove.js";
import { handleReset } from "./command-reset.js";
import { handleSearch } from "./command-search.js";
import { handleStatus } from "./command-status.js";
import { handleSupersede } from "./command-supersede.js";
import { handleToggle } from "./command-toggle.js";
import { commandUsage, isMutatingCommand, splitSubcommand } from "./command-utils.js";
import type { DecisionCommandDeps } from "../types.js";

export async function handleDecisionCommand(
	args: string,
	ctx: ExtensionCommandContext,
	deps: DecisionCommandDeps,
): Promise<void> {
	const trimmed = args.trim();
	if (trimmed.length === 0) {
		ctx.ui.notify(commandUsage(), "info");
		return;
	}

	const { subcommand, rest } = splitSubcommand(trimmed);
	if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
		ctx.ui.notify(commandUsage(), "info");
		return;
	}

	if (!deps.state.ready) {
		ctx.ui.notify("Decision memory is initializing. Try again in a moment.", "warning");
		return;
	}

	if (subcommand === "status") return handleStatus(ctx, deps);
	if (subcommand === "enable") return handleToggle(rest, true, ctx, deps);
	if (subcommand === "disable") return handleToggle(rest, false, ctx, deps);

	if (!deps.state.config.enabled && isMutatingCommand(subcommand)) {
		ctx.ui.notify("Decision memory is disabled. Enable it to modify decisions.", "warning");
		return;
	}

	if (subcommand === "add") return handleAdd(rest, ctx, deps);
	if (subcommand === "edit") return handleEdit(rest, ctx, deps);
	if (subcommand === "remove") return handleRemove(rest, ctx, deps);
	if (subcommand === "supersede") return handleSupersede(rest, ctx, deps);
	if (subcommand === "purge") return handlePurge(rest, ctx, deps);
	if (subcommand === "reset" || subcommand === "clear") return handleReset(rest, ctx, deps);
	if (subcommand === "list") return handleList(ctx, deps);
	if (subcommand === "search") return handleSearch(rest, ctx, deps);

	ctx.ui.notify(`Subcommand '${subcommand}' scaffolded but not implemented yet.`, "info");
}
