# AntanI

A minimal, low-RAM macOS desktop app that orchestrates CLI coding agents
(Claude Code, opencode), terminals, and an embedded VS Code across your local
project folders — one window, one sidebar of projects, tabbed workspaces per
project. Built with Tauri v2 (system WebView, no Electron/Chromium) + React.

> Personal tool, work in progress. Built in ordered phases — **Phase 1 (shell,
> project sidebar, persistence) is done**; terminals, embedded VS Code, agent
> status, polish, and release come next.

## Prerequisites

- **macOS** (Apple Silicon or Intel)
- **[Bun](https://bun.sh)** — package manager + runtime
- **[Rust](https://rustup.rs)** (stable toolchain) — the Tauri backend
- **[code-server](https://coder.com/docs/code-server/install)** on your `PATH` —
  required for the embedded VS Code tab. Install with:
  ```sh
  brew install code-server
  ```
  Settings and extensions are stored inside the app's data dir
  (`~/Library/Application Support/com.antani.app/`) and persist across app
  updates and VS Code uninstalls. The `code-server` binary itself is the only
  external dependency — bundling it is planned for the first public release.

## Getting started

```sh
bun install          # install JS deps (also wires the git hooks)
bun run tauri dev    # launch the app with hot reload
```

The first `tauri dev` compiles the Rust backend, so it takes a bit; subsequent
launches are fast. Projects and settings persist to the OS app-data dir
(`~/Library/Application Support/com.antani.app/`); tabs are session-only.

## Everyday commands

| Command | What it does |
| --- | --- |
| `bun run tauri dev` | Run the app in development (hot reload) |
| `bun run build` | Type-check + build the frontend bundle |
| `bun run tauri build` | Build the macOS app bundle (not release-tuned yet) |
| `bun run lint` / `bun run lint:fix` | Biome lint + format (check / apply) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run knip` | Find unused files / exports / deps |
| `bun run test` / `bun run test:coverage` | Vitest (pure frontend logic) |
| `bun run rust:fmt` / `rust:clippy` / `rust:test` | Rust format / lint / tests |

## Quality gates

- **Pre-push (husky):** fast checks only — Biome, `tsc`, knip, `cargo fmt`.
- **Before shipping:** run the full set — Vitest (`bun run test`),
  `clippy -D warnings` (`bun run rust:clippy`), `cargo test` (`bun run rust:test`),
  and coverage (`bun run test:coverage`). These will move into CI once the repo is
  public.

Don't bypass hooks with `--no-verify`; fix the cause.

## Layout

- `src/` — React + TypeScript frontend (Vite, Tailwind v4)
- `src-tauri/` — Rust backend (state, persistence, IPC; more per phase)

See `AGENTS.md` (root, `src/`, `src-tauri/src/`) for the conventions and the
rationale behind them.
