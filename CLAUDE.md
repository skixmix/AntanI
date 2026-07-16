# AntanI — Agent Guide (root)

> **App name: AntanI.** Use this name in code, commits, and docs.

## What this is, and why

AntanI is a **personal** macOS desktop app that orchestrates CLI coding agents
(OpenCode, Claude Code, Codex), terminals, and an embedded VS Code across local project
folders — one window, a sidebar of projects, a tabbed workspace per project. It
exists because the tool it replaces (Superset) is heavy: **low RAM is the whole
point.**

That single constraint drives the biggest technical choice: **Tauri v2 on the
system WebView. Never introduce Electron or bundle Chromium** — that would defeat
the reason this project exists.

It serves one person on one or two Macs and ships unsigned via a personal Homebrew
tap. There is no cloud, no account, no telemetry. Weigh every addition against that
scope.

## What we deliberately do NOT build

Saying no is a feature here. Out of scope: git worktree management, PR/task boards,
session history/restore, cloud sync, Windows/Linux support, a plugin API,
telemetry. Terminal tabs are **session-only** — never persisted, so every launch
starts clean; only projects and settings persist. That asymmetry is intentional,
not a missing feature.

Update *installation* stays out of scope too (no self-updating binary — the app
is unsigned, so a silent self-replace would be a bad idea anyway). The one
exception is a passive **update check**: `src/lib/updateCheck*.ts` hits the
GitHub releases API once per launch and shows a badge in the status bar if a
newer tag exists; clicking it opens the releases page. No download, no install,
no background polling — installing the update is still `brew upgrade` by hand.

## Code intelligence

This repo has a `.codegraph/` index. Before grepping or reading files to
understand or locate code, use codegraph first — the MCP tool
`codegraph_explore` (or `codegraph explore "<question>"` in the shell). One
query returns the relevant symbols' verbatim source plus the call paths
between them, including dynamic-dispatch hops (renders, callbacks) that grep
can't follow.

## Rules

- **Minimalism / YAGNI.** Prefer deleting features over abstracting. Add a
  dependency only when it clearly pays for itself. Duplication beats a premature
  abstraction. Fix bugs minimally — don't refactor while fixing.
- **Zero personal data in the repo.** It is meant to go public. Never commit
  names, emails, credentials, API keys, tokens, absolute home paths, or
  machine-specific values. Use generic placeholders (e.g. `/Users/foo/...`) in
  tests and examples. `projects.json` lives in the OS app-data dir, never in the
  repo. The one intentional exception is the `LICENSE` copyright line, which names
  the author for attribution — don't "scrub" it.
- **Pin every dependency to an exact version** (`package.json` with no `^`/`~`,
  and `Cargo.toml` where practical) so the tool builds identically every time.
  Upgrades are deliberate, reviewed changes.
- **Verify current APIs before coding.** Tauri v2, its plugins, and agent hook
  formats drift. Read current docs; don't code IPC/plugin/hook details from memory.
- **Never bypass the quality gate.** The `husky` pre-push hook runs the fast
  checks — Biome (lint + format), `tsc`, `knip`, `cargo fmt`. The heavier checks
  (Vitest, `clippy -D warnings`, `cargo test`, coverage) run from their scripts and
  are the bar before shipping. No `--no-verify`; fix the cause, not the gate.
- **Tooling is fixed.** `bun` is the package manager + runtime; Biome does both
  lint and format (Bun ships neither); `knip` guards against dead code. Don't add
  ESLint, Prettier, or a second formatter.
- **Clean code over clever code.** Favor readable, self-explanatory code:
  descriptive names, small focused functions, early returns over nested
  conditionals, no unnecessary indirection. Code should read as what it does
  without needing a comment to explain it — see the comments rule below for
  the corollary.
- **No comments by default.** Write zero comments unless the *why* is non-obvious
  to a future reader: a hidden constraint, a subtle invariant, a platform-specific
  workaround. Never narrate what the code does, never add section headers, never
  write docstrings that restate the function name.
- **Caveats belong in CLAUDE.md, not just inline.** When you hit a non-obvious
  constraint that would help future work in an area (a platform quirk, a footgun,
  a "why this and not the obvious alternative"), write it up in the relevant
  `CLAUDE.md` — root or the nearest subdirectory one — rather than leaning on an
  inline comment alone. `src/CLAUDE.md`'s "Tauri / WKWebView platform notes" is
  the model to follow. If a new area of the codebase (a new subsystem, a new
  top-level directory) accumulates its own conventions or caveats, create a
  `CLAUDE.md` for it instead of piling everything into the root file.

## Testing philosophy: behavior, not brittle

Test **observable behavior and real logic**, never implementation details or
markup:

- **Rust** — unit-test the state and merge logic, above all anything that writes to
  the user's own files (the agent-hook config merge most of all: it must never drop
  or overwrite a user's existing hooks). Assert outcomes — which project is active,
  the resulting order, a save→load round-trip — not internal layout.
- **Frontend** — Vitest covers **pure logic only** (`src/lib`). We deliberately
  write **no** React component / e2e tests and **no** Tauri IPC mocks: they are
  brittle, break on harmless markup changes, and are a maintenance burden a
  one-person tool shouldn't carry. The UI is verified by running the app.

Per-area rules live in `src/CLAUDE.md` and `src-tauri/src/CLAUDE.md`.

## Commits

Conventional messages (`feat:`, `fix:`, `chore:`, …). Only commit when explicitly
asked.
