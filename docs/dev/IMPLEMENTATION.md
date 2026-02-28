# Pi Decision Memory Extension — Implementation Plan

This document defines the implementation approach for a new extension that gives Pi durable, per-project decision memory.

## Goal

Add an official Pi extension that:
- Stores end-user decisions per project across sessions
- Injects relevant active decisions into model context safely (token-aware)
- Supports duplicate/conflict handling
- Can be disabled globally or per project
- Does not load behavior or write memory when disabled

## Naming

Proposed package/folder name: **`pi-decision-memory`**

Reason:
- Explicit and descriptive
- Aligns with Pi extension naming style
- Future-proof for package extraction if needed

---

## Scope and Behavior

### What is a decision
A decision is a chosen, actionable rule that affects future work and had alternatives.

Examples:
- "Use PostgreSQL for primary DB"
- "Auth uses OAuth2 + JWT"

Non-decisions:
- Tasks, temporary ideas, neutral facts

### Status model
Each decision has one status:
- `active`
- `superseded`
- `rejected`
- `draft`

Only `active` decisions are included in LLM context by default.

### Purge policy (v1)
Retention-based and explicit:
- `active` decisions are always kept
- Non-active decisions (`draft`, `superseded`, `rejected`) are deleted only when older than their configured `retentionDays`
- `/decision purge` requires confirmation before destructive write
- `retentionDays` values are required for all non-active statuses (`draft`, `rejected`, `superseded`)

---

## Storage Model

### Extension install scope
Target: **global extension** (works across all projects)

### Canonical storage (source of truth)
Use **append-only JSONL** per project as the primary durable file:
- `<project>/.pi/decision-memory/decisions.jsonl`
- one event per line (add/edit/status/supersede/remove)

Rationale:
- append-friendly writes
- preserves full history/audit trail
- lower merge-conflict risk than mutable object snapshots

### Derived indexes (runtime)
Build in-memory indexes on load from JSONL:
- `byId: Map<string, Decision>`
- optional: `byStatus`, `byTag`

These indexes are **derived/cache**, not canonical.
If process restarts, rebuild from JSONL.

Project identity:
1. git root (`git rev-parse --show-toplevel`)
2. fallback: `cwd`
3. normalize and hash for stable project id in events

### Config files
Global config:
- `~/.pi/agent/decision-memory.config.json`

Project config:
- `<project>/.pi/decision-memory.config.json`

Config shape:
```json
{
  "enabled": true,
  "retentionDays": {
    "draft": 30,
    "rejected": 90,
    "superseded": 180
  },
  "context": {
    "maxDecisions": 20
  },
  "autoCapture": {
    "enabled": true,
    "confirm": true,
    "maxPerTurn": 2
  }
}
```

Notes:
- `retentionDays` is used in v1 purge behavior.
- `retentionDays` is required and must include `draft`, `rejected`, and `superseded`.
- `context.maxDecisions` controls injected active decisions (default 20, clamped to 1..20).
- `autoCapture` is enabled by default with confirmation.

### Read/write semantics
- Writes: append event line to `<project>/.pi/decision-memory/decisions.jsonl`; avoid full-file rewrite for normal operations.
- Reads: query in-memory indexes for fast access.
- Startup: replay JSONL to rebuild indexes.
- Recovery: if indexes are missing/corrupt, regenerate from JSONL.

---

## Enable/Disable Resolution

On `session_start`:
1. Read global config
2. Resolve project root/id
3. Read project config (if present)
4. Compute effective enabled state:
   - if global disabled => disabled
   - else if project config exists => project enabled value
   - else enabled
5. Merge policy field (`retentionDays`) with project override precedence

When disabled:
- No context injection
- No memory writes
- `/decision add|edit|remove|supersede` reject with clear message

---

## Commands

Register `/decision` command with subcommands:

- `help`
- `add <text>`
- `list`
- `search <query>`
- `edit <id> <text>`
- `remove <id>`
- `supersede <oldId> <newText>`
- `status`
- `purge`
- `reset` (alias: `clear`)
- `enable --global`
- `disable --global`
- `enable --project`
- `disable --project`

Optional (later):
- `conflict <id1> <id2> [note]`
- `resolve <id> <status>`
- `doctor` (integrity and duplicate checks)

### Auto-capture (current)
- Trigger: `before_agent_start`
- Source: explicit user prompt markers only
- Extraction: `Decision: <text>` lines (no assistant heuristic parsing)
- Dedup: skip if exact normalized match against existing active decisions
- Safety: optional per-candidate confirmation (`autoCapture.confirm`)
- Throughput cap: `autoCapture.maxPerTurn`

### Auto-capture v2 (planned)
Goal: capture user decisions/orders with confirmation **after** task execution.

- Step 1 (`before_agent_start`): extract candidate directives/decisions from user prompt.
- Step 2: keep candidates in-memory as `pending` for the current turn.
- Step 3 (`agent_end`): present one review prompt with multi-select choices.
- Step 4: persist only selected items as `a` (add) events.

Rules:
- Source is user prompt only (never assistant text).
- No heuristic assistant parsing.
- Dedup before UI and before persist.
- Respect `autoCapture.maxPerTurn`.
- If multi-select UI is unavailable, fall back to per-candidate Yes/No confirmations.
- If run fails/cancels, skip capture prompt by default.

---

## Schemas

### Event schema (JSONL line, canonical, compact on-disk)
Each line is an immutable event.

```json
{
  "v": 1,
  "t": "2026-02-27T06:00:00.000Z",
  "p": "<projectHash>",
  "e": "a",
  "i": "D-2026-02-27-0001",
  "d": {
    "ti": "Use PostgreSQL",
    "tx": "Primary datastore is PostgreSQL 16.",
    "tg": ["db", "backend"],
    "s": "active",
    "r": "Need relational integrity",
    "sp": null,
    "c": []
  },
  "u": "user"
}
```

Compact key map (disk -> runtime):
- `t` -> `ts`
- `p` -> `projectId`
- `e` -> `event`
- `i` -> `id`
- `d` -> `data`
- `u` -> `actor`
- `ti` -> `title`, `tx` -> `text`, `tg` -> `tags`, `s` -> `status`, `r` -> `reason`, `sp` -> `supersedes`, `c` -> `conflictsWith`

Compact event codes:
- `a` = `decision.add`
- `ed` = `decision.edit`
- `st` = `decision.status`
- `su` = `decision.supersede`
- `rm` = `decision.remove`

Instruction for implementation:
- On write: persist compact form only.
- On read: decode to readable runtime shape before applying logic.
- Keep codec centralized (`encodeEvent`/`decodeEvent`) so commands never depend on short keys.
- Keep `v` for forward-compatible migrations.

### Materialized decision view (in-memory, derived)
Built by replaying events in order.

```ts
Decision {
  id: string
  projectId: string
  title: string
  text: string
  tags: string[]
  status: "active" | "draft" | "rejected" | "superseded"
  supersedes: string | null
  conflictsWith: string[]
  reason?: string
  createdAt: string
  updatedAt: string
  createdBy?: string
}
```

### Context projection (token-aware, minimal)
Do **not** inject full objects. Inject compact projection only.

Per decision in prompt:
- `id`
- short text (`title` or truncated `text`)
- `status` (only if not implied)
- optional tiny `tags` subset

Exclude from prompt by default:
- `projectId`, `createdBy`, `createdAt`, `updatedAt`, `conflictsWith`, long `reason`

---

## Duplicate and Conflict Policy

### Duplicate detection
- Normalize text (lowercase, trim, collapse whitespace, remove punctuation)
- If high similarity with existing active decision:
  - do not auto-add
  - prompt action: update existing, force create, or cancel

### Opposite/conflicting decisions
When adding a decision that conflicts with active one(s):
- prompt action:
  - `supersede <oldId>` (recommended)
  - keep both and mark conflict
  - cancel

Superseding should require reason.

---

## Local Search Strategy

Hybrid search:
1. In-memory structured search for normal usage
2. `rg` fallback for large files / power queries

Search fields:
- `id`, `title`, `text`, `tags`, `reason`, `status`

Planned filters:
- `status:active`
- `tag:<name>`

---

## Token-safe Context Injection

Hook: `before_agent_start`

Inject compact section:
- include only `active` decisions
- include latest N from config (`context.maxDecisions`, default 20, max 20)
- per decision budget: `maxCharsPerDecision = 160`
- text budget: `title` first, fallback to `text.slice(0, 120)`
- tags budget: max 2 tags, each max 12 chars
- total section budget: `maxSectionChars = 2200` (hard cap)
- overflow handling: keep most recent + append short rolling summary

Prompt format (compact):
- `D-xxxx | <short text> | #tag1 #tag2`

If disabled: inject nothing.

---

## Extension Events and API Usage

Use Pi extension APIs:
- `session_start` for initialization and config resolution
- `before_agent_start` for context injection
- `pi.registerCommand()` for decision CLI
- `ctx.ui.notify()` for feedback
- `pi.exec()` for git-root detection and optional rg fallback

Avoid session-only persistence for canonical decision memory.

---

## PR Readiness Checklist (Official Pi Repo)

- [ ] Extension code added under official extension location in repo
- [ ] Clear README/docs section with examples
- [ ] Tests for:
  - [ ] global/project enable toggles
  - [ ] project identity resolution
  - [ ] add/edit/remove/supersede
  - [ ] purge behavior (keep active, remove non-active by retentionDays)
  - [ ] duplicate detection
  - [ ] conflict handling
  - [ ] token-safe injection limits
- [ ] No writes when disabled
- [ ] Robust behavior without git repo
- [ ] Type-safe schema and parsing guards
- [ ] Backward-compatible config defaults (`enabled: true`)

---

## Next Step

Initialize extension scaffold and implement in this order:
1. Core scaffolding + config resolution
2. Add/list/status commands
3. Enable/disable controls
4. Context injection
5. Edit/remove/search
6. Purge command (keep active; purge non-active by retentionDays)
7. Supersede/conflict flow
8. Tests and docs
