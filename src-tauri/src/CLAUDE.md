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

## App menu is swapped by IDE focus (`menu.rs` + `ide_webview.rs`)

On macOS the app menu gets `performKeyEquivalent:` before web content, so any
menu item whose accelerator matches a keystroke swallows it before the focused
webview — including the embedded VS Code child — sees it. Because that menu is
app-wide (there is no per-webview menu on macOS), we swap the whole menu on IDE
focus instead:

- **Main UI focused → `menu::build`** (full Edit: Undo/Redo/Cut/Copy/Paste/Select
  All). macOS WKWebView *requires* those native items for undo, clipboard, and
  select-all in the UI's own text fields — dropping them breaks those keys, and
  removing Cut/Copy/Paste specifically breaks paste (see Tauri #2397 / Wry #328).
- **Embedded VS Code focused → `menu::build_ide`** (Cut/Copy/Paste only). Dropping
  Undo/Redo and Select All lets Cmd+Z / Cmd+Shift+Z / Cmd+A fall through to
  Monaco. Clipboard items stay for the reason above.
- `IdeWebviews::active` is the single source of truth for which menu is installed;
  `set_ide_active` derives the menu from it. The IDE lifecycle commands
  (create/show vs hide/close) can fire out of order across a project switch, so
  deactivation only clears `active` when the id matches — never swap the menu
  blindly per event.
- **Known tradeoff, not a bug:** while VS Code is focused the surviving Cut/Copy/
  Paste accelerators still shadow Cmd+K chords whose second stroke is Cmd+C/X/V
  (e.g. Cmd+K Cmd+C = Add Line Comment). There is no stateless way to keep single
  Cmd+C as Copy *and* free it for the chord; fixing it would need a native
  `NSEvent` key router. Cmd+/ toggles comments and is unaffected.

## Window state restore is fullscreen-aware (`window_restore.rs`)

`tauri-plugin-window-state` is registered with `.skip_initial_state("main")` and
the main window is restored by hand (`restore_main_window`) instead of by the
plugin's automatic pass. This is a deliberate workaround for a macOS bug, not an
accident:

- Root cause is an AppKit fullscreen/Space restoration race, not the plugin's
  geometry. A bare `set_fullscreen(true)` at startup fires while macOS is still
  restoring or relocating the previous fullscreen window, so `toggleFullScreen:`
  (what tao maps `Fullscreen::Borderless` to, dispatched asynchronously and never
  awaited) builds the Space against a stale screen/frame and overshoots the
  display until the user manually exits and re-enters fullscreen. An earlier
  attempt that restored only `FULLSCREEN | VISIBLE` after a delay did **not** fix
  this, which is the tell that the frame, not the saved size, was never the
  problem.
- The plugin also saves a fullscreen window's `inner_size` as its **windowed**
  size (it guards the size-save against *maximized* but not *fullscreen*), so its
  own `restore_state` would `set_size(fullscreen_size)` then `set_fullscreen(true)`.
  We never take that path for a fullscreen main window.
- What we do instead: the window is created hidden (`"visible": false` in
  `tauri.conf.json`) so no intermediate frame flashes. A windowed saved layout
  restores immediately via the plugin's own `restore_state(StateFlags::all())`
  (which also shows it; don't reimplement its monitor-intersection / maximized
  logic). An absent or unreadable state file just shows the config-default
  window, **not** `restore_state(all)`, which could reapply corrupt geometry.
- A fullscreen saved layout waits for the display to settle (single-monitor: a
  500 ms delay; multi-monitor or uncertain detection: `Moved` / `Resized` /
  `ScaleFactorChanged` activity stays quiet for 200 ms, two-second hard fallback), then
  on the main thread places a config-default windowed frame **centered
  on a still-attached target monitor** (the monitor whose bounds contain the saved
  frame's centre, else the primary, else any), shows the window, calls
  `set_fullscreen(true)`, and focuses. Handing `toggleFullScreen:` an unambiguous
  on-screen frame on a valid monitor, after the startup churn, is what stops the
  overshoot. `configured_window_size` reads the "main" entry's width/height
  straight from `app.config()` (parsed `tauri.conf.json`), so there is nothing to
  keep in sync by hand; `FALLBACK_WINDOW_WIDTH/HEIGHT` only fires if "main" is
  somehow missing from the config.
- Waiting must run off the main thread, then use `run_on_main_thread` for the
  restore: calling `run_on_main_thread` from `setup` runs synchronously and
  wouldn't defer anything. Note `run_on_main_thread` does not make fullscreen
  synchronous; tao still queues the native transition asynchronously.
- Consequence, accepted: quitting while fullscreen still persists the bogus
  fullscreen size, but our fullscreen branch ignores it and rebuilds a centered
  default frame, so exiting a restored fullscreen falls back to the
  tauri.conf.json config default rather than the last custom windowed frame.
- This is a pragmatic pure-Tauri fix verified by running the app. If the AppKit
  race ever slips through again, the next levers (both need an `objc2` bridge, so
  weigh them against the minimalism rule) are disabling per-window NSWindow
  restoration via `setRestorable(false)` so AppKit stops competing, and awaiting
  `NSWindowDidEnterFullScreen` with a one-shot `false -> true` repair when the
  entered frame doesn't match its `NSScreen`.

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
