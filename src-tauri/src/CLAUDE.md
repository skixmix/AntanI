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
- **Terminal PTYs are session-only and must leave zero orphans.** They live in an
  in-memory map keyed by tab id — never persisted, because tabs are ephemeral. A
  `PtySession` kills its child on `Drop`, so closing a tab (removing it from the
  map) reaps that process, and on app quit `RunEvent::Exit` clears the whole map so
  nothing survives. Dropping the PTY **master** closes the pty and SIGHUPs the
  foreground process group, so a shell's children (e.g. `htop`) die with it — don't
  downgrade this to killing only the shell pid.

## Embedded VS Code: the bundled IDE bridge extension

The commands in `ide_bridge.rs` reach a small bundled VS Code extension in
`src-tauri/vscode-extension/`. It runs inside code-server and uses public VS Code
APIs to open files and native SCM diffs without reloading the editor. Diff
requests await `git.refresh` before `git.openChange`, otherwise the Git extension
can silently miss a newly changed file because its repository model is stale.

- **Self-healing install, not hand-rolled bookkeeping.** The extension is
  reinstalled via code-server's own `--install-extension --force` CLI flag on
  every server launch (`install_bridge_extension`), not by writing to
  code-server's internal `extensions.json`/`.obsolete` format directly (that
  format is undocumented and already fragile enough to need
  `sync_extensions_manifest`'s workarounds for the *legitimate*
  `import_from_vscode` case). This means the extension requires zero user
  action and comes back automatically even if the user deletes it — there is
  no separate "is it installed" check; it's just reinstalled, cheaply, before
  every server start.
- **One socket per project, not one shared socket.** code-server spawns a
  separate extension-host process per open workspace folder, so a single
  shared socket path would race between them (only one host could bind it).
  Instead, both Rust (`bridge_socket_path_for`) and the extension
  (`extension.js`) independently compute the same socket filename by hashing
  the project's folder path with a small dependency-free FNV-1a (mirrored
  byte-for-byte in both places) — no IPC is needed to hand out the name, and
  each project's extension host binds only the socket it derives for itself.
- **The `.vsix` is a committed prebuilt binary**, not a build-time artifact —
  there's no vsix packaging step in the app's normal dev/build flow. If
  `extension.js` or `package.json` changes, rebuild and commit it (see
  `vscode-extension/README.md` for the one-line command).
- The frontend retries `open_diff_in_ide` for a few seconds after asking to
  open the IDE tab (`SourceControlSidebar.tsx`), since the server/webview/
  extension may still be starting up the first time a project's IDE tab opens.

## Backup archives

- Export categories own paths by their first app-data component: Projects &
  customizations owns `projects.json` (including colors, quick actions, and custom
  prompts); App preferences owns `settings.json` plus every unclassified path;
  VS Code profile owns `vscode-server-data/` and
  `imported-user-settings.json`; VS Code extensions owns `extensions/`. Keep App
  preferences as the catch-all so future persisted settings are backed up
  automatically. Add an explicit category mapping only when a new path clearly
  belongs to one of the other three categories.
- `vscode-server.pid` and `diff-bridge-sockets/` are always excluded because
  restoring stale process metadata could target an unrelated PID or dead socket.
- Archive validation rejects traversal, symlinks, encryption, duplicate or
  case-conflicting reserved paths, invalid reserved path types, undeclared
  category contents, and excessive entry counts or expanded sizes.
- Import validates and extracts beside the app-data directory, merges selected
  categories with the current unselected data in staging, stops code-server,
  swaps the merged directory into place with rollback protection, updates both
  in-memory state locks, and restarts AntanI. Do not import individual files into
  the live directory or remove the restart; either change can leave Rust state and
  disk state disagreeing.
- `BackupMaintenance` serializes backup work with VS Code startup and desktop
  VS Code import. Export stops and restores a running embedded server when its
  files are selected. A fixed sibling rollback directory makes an interrupted
  two-rename import recoverable before persisted state is loaded at startup.

## Testing: behavior, not brittle

Unit-test the **state and merge logic** by asserting observable outcomes: which
project ends up active after add/remove, the resulting order after a reorder, and
save→load round-trip equality. This matters most for anything touching the user's
files — above all the agent-hook config merge, which must never drop or overwrite a
user's existing hooks.

Don't test the thin command wrappers directly — they'd need a Tauri runtime and
would only re-exercise the state layer. Test the layer that holds the logic.
