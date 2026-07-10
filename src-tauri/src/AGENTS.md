# Rust backend — Agent Guide (`src-tauri/src/`)

## Why this exists

The Rust side owns everything stateful and OS-facing: JSON persistence and IPC
commands, and it also owns the terminal PTYs, the embedded VS Code server process,
and the local agent-event HTTP server. The frontend is a thin view — real logic
belongs here.

## Rules

- **One crate, one module per concern** (`state`, and likewise `pty`,
  `vscode_server`, `events_api` as they are added). Keep concerns from bleeding
  into each other.
- **`state.rs` is deliberately Tauri-free.** It holds the pure data model,
  persistence, and mutation methods so it unit-tests without a Tauri runtime. Do
  not import `tauri` types into it — the thin `#[tauri::command]` wrappers live in
  `lib.rs`.
- **Persistence = one JSON file per concern** in the OS app-data dir. No database.
  Writes are **atomic** (temp file + rename). A missing or unparseable file loads
  defaults — never crash or clobber on a bad file; the next save rewrites it
  cleanly. This is what lets a corrupted or hand-edited file self-heal.
- **Command pattern.** Lock the state mutex once, mutate, persist, then return the
  **full** updated state so the frontend can adopt it without drift. Surface save
  failures as `Result<_, String>` (the UI shows a toast) — don't `unwrap`.
- **camelCase at the boundary.** Structs crossing IPC/JSON use
  `#[serde(rename_all = "camelCase")]` so the TypeScript side stays idiomatic. Keep
  it consistent.
- **ACL / capabilities.** Custom app commands need no permission entry;
  **plugin/core** commands do (`src-tauri/capabilities/default.json`). When you
  remove a plugin, remove its dependency, its `.plugin(...)` registration, **and**
  its capability — leave no dead grants.
- **No panics on user-reachable paths.** No `unwrap`/`expect` on input or file
  contents. A single `expect` at `run()` startup is acceptable.

## Testing: behavior, not brittle

Unit-test the **state and merge logic** by asserting observable outcomes: which
project ends up active after add/remove, the resulting order after a reorder, and
save→load round-trip equality. This matters most for anything touching the user's
files — above all the agent-hook config merge, which must never drop or overwrite a
user's existing hooks.

Don't test the thin command wrappers directly — they'd need a Tauri runtime and
would only re-exercise the state layer. Test the layer that holds the logic.
