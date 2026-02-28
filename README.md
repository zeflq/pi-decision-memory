# pi-decision-memory

Durable per-project decision memory extension for Pi.

## Install

```bash
pi install https://github.com/zeflq/pi-decision-memory
```

## What it does

- Stores decisions in your project at:
  - `.pi/decision-memory/decisions.jsonl`
- Provides `/decision` commands to add, edit, search, purge, and reset decisions
- Injects active decisions into context with token-aware limits
- Supports explicit auto-capture from user prompt lines:
  - `Decision: <text>`

## Usage docs

See the extension README:

- [`extensions/pi-decision-memory/README.md`](./extensions/pi-decision-memory/README.md)

## Changelog and releases

- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Versioning: SemVer (`major.minor.patch`)
- Commit style: Conventional Commits (`feat:`, `fix:`, etc.)

Release commands:

```bash
npm run check
npm run release:patch   # or release:minor / release
```

## Dev docs (archived from implementation phase)

- [`docs/dev/IMPLEMENTATION.md`](./docs/dev/IMPLEMENTATION.md)
- [`docs/dev/TODO.md`](./docs/dev/TODO.md)
