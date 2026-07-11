---
name: adding-tauri-command
description: Add a new Tauri IPC command end-to-end in AntanI (Rust command, registration, capability, TS wrapper, types). TRIGGER — read BEFORE writing any `#[tauri::command]` fn, any new `src-tauri/src/*.rs` module with commands, any `tauri::generate_handler!` edit, or any new/edited `src/lib/*.ipc.ts` file — even if the change looks like "just one function" or you already know the pattern from reading existing modules (pty.rs, api.ipc.ts, etc.) firsthand in this session. Trigger on requests like "add a command", "expose X to the frontend", "wire up IPC for Y", "new backend endpoint", or when a plan you're implementing includes a new Rust command + TS wrapper pair. Re-check this skill even mid-implementation if you notice you're about to hand-roll the same steps from memory instead of following the checklist.
---

# Add a Tauri IPC command

AntanI's frontend is a thin view over Rust state (see root `AGENTS.md` /
`src/AGENTS.md` / `src-tauri/src/AGENTS.md`). Adding a new command touches
several files, and skipping one is easy to miss — this is a checklist, not new
policy.

## Steps

1. **Write the Rust command** in the right module (`state`, `pty`,
   `vscode_server`, `ide_webview`, or a new module for a new concern — don't
   let concerns bleed together). Signature:
   ```rust
   #[tauri::command]
   fn do_thing(state: State<AppState>, some_arg: String) -> Result<AppData, String> {
       mutate(&state, |d| d.do_thing(&some_arg))
   }
   ```
   - Lock the state mutex once, mutate, persist, return the **full** updated
     state (`AppData`/`Settings`) — never a partial diff. The frontend adopts
     this return value instead of optimistically mutating local state.
   - Real logic (mutation, validation) belongs in `state.rs`'s data model, not
     in the command wrapper — `state.rs` stays Tauri-free so it unit-tests
     without a Tauri runtime. The command is a thin wrapper.
   - No `unwrap`/`expect` on user input or file contents — surface failure as
     `Result<_, String>`.
   - Structs crossing this boundary need `#[serde(rename_all = "camelCase")]`.

2. **Register it** in the `tauri::generate_handler![...]` list in `lib.rs`
   (module-qualified if it lives outside `lib.rs`, e.g. `pty::pty_spawn`).
   Forgetting this step compiles fine and fails silently at call time.

3. **Capability check**: custom app commands (anything in this crate) need
   **no** entry in `src-tauri/capabilities/default.json`. Only **plugin/core**
   commands (dialog, notification, opener, etc.) need a permission there. Add
   one only if you're calling a new plugin API, not for your own command.

4. **TS wrapper** in `src/lib/api.ipc.ts` (or a sibling `*.ipc.ts` if it's a
   distinct concern, e.g. `notifications.ipc.ts`):
   ```ts
   export function doThing(someArg: string): Promise<AppData> {
     return invoke<AppData>("do_thing", { someArg });
   }
   ```
   - Tauri v2 maps camelCase JS keys to snake_case Rust params — call with
     camelCase (`someArg`), not the Rust name.
   - Any new file that's purely `invoke`/`listen`/plugin-API wrapping **must**
     use the `.ipc.ts` suffix — `vitest.config.ts` excludes
     `src/lib/**/*.ipc.ts` from the coverage gate by that pattern. A wrapper
     file without the suffix drags down the global 90% coverage target for no
     testing value.

5. **Mirror types** in `src/lib/types.ts` (camelCase, matching the Rust struct
   exactly) if the command introduces or changes a shape.

6. **Don't write a component/IPC-mock test** for this. Vitest only covers pure
   logic in `src/lib`; Rust-side behavior worth testing lives in `state.rs`'s
   own unit tests (state/merge logic, save→load round-trips), not the command
   wrapper.
