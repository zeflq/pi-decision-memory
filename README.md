# pi-decision-memory

Durable, per-project decision memory for Pi.

- Canonical storage: append-only JSONL at `<project>/.pi/decision-memory/decisions.jsonl`
- Fast reads: in-memory indexes rebuilt from JSONL on session start
- Context injection: token-aware active decisions only
- Optional post-run auto-capture from user prompt decision/order lines (enabled by default, confirm by default)

## Install

From GitHub:

```bash
pi install https://github.com/zeflq/pi-decision-memory
```

## Commands

```text
/decision help
/decision status
/decision add <text>
/decision list
/decision search <query>
/decision edit <id> <text>
/decision remove <id>
/decision supersede <oldId> <newText>
/decision purge [--yes]
/decision reset [--yes]
/decision clear [--yes]  (alias of reset)
/decision enable --global|--project
/decision disable --global|--project
```

### Notes

- `purge` without `--yes` is preview-only.
- `reset`/`clear` without `--yes` is preview-only and clears all decisions when confirmed.
- `add` includes duplicate/conflict handling prompts in UI mode.

## Config

Global: `~/.pi/agent/decision-memory.config.json`

Project: `<project>/.pi/decision-memory.config.json`

Project config overrides global (unless global `enabled: false`).

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

### Defaults and limits

- `context.maxDecisions`: default `20`, clamped `1..20`
- `autoCapture.maxPerTurn`: default `2`, clamped `1..5`
- `retentionDays` applies to non-active statuses only

## Retention and purge rules

- `active` decisions are never purged by retention
- `draft`, `rejected`, `superseded` are purge candidates when older than configured retention
- purge writes `rm` events (append-only)

## Compact on-disk schema (JSONL)

Each line is one event:

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
    "tg": ["db"],
    "s": "active",
    "r": "Need relational integrity",
    "sp": null,
    "c": []
  },
  "u": "user"
}
```

### Codec map

- `t` -> timestamp
- `p` -> projectId/hash
- `e` -> event code
- `i` -> decision id
- `d` -> data payload
- `u` -> actor

Data payload:

- `ti` title
- `tx` text
- `tg` tags
- `s` status
- `r` reason
- `sp` supersedes
- `c` conflictsWith
- `so` source
- `cf` confidence
- `cg` category

Event codes:

- `a` add
- `ed` edit
- `st` status
- `su` supersede
- `rm` remove

## Auto-capture

Auto-capture is **post-run**:

1. On `before_agent_start`, the extension extracts decision/order candidates from the user prompt.
2. On `agent_end`, it asks which candidates to save (multi-select flow).
3. Selected items are persisted as decisions.

Accepted prompt patterns include:

```text
Decision: <your decision text>
Use React for frontend
Do not reuse legacy Lottery tables
In this project we will use clean architecture
```

Behavior:

- source is user prompt only (never assistant text)
- rule-based classifier scores candidates and keeps high confidence (`>= 0.65`)
- structured classification fields: `isDecision`, `normalizedText`, `confidence`, `category`, `reason`
- capped by `autoCapture.maxPerTurn`
- skips exact normalized duplicates of active decisions
- asks confirmation/selection when `autoCapture.confirm = true`
- if multi-select is unavailable, falls back to per-candidate yes/no confirm
- skipped on failed/aborted runs by default
- disabled entirely when `autoCapture.enabled = false`

Captured decisions store metadata (`source`, `confidence`, `category`) for traceability.

## Changelog and releases

- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Versioning: SemVer (`major.minor.patch`)
- Commit style: Conventional Commits (`feat:`, `fix:`, etc.)

Release commands:

```bash
npm run check
npm run release:patch   # or release:minor / release
```

## Dev docs

- [`docs/dev/IMPLEMENTATION.md`](./docs/dev/IMPLEMENTATION.md)
- [`docs/dev/TODO.md`](./docs/dev/TODO.md)
