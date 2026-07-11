import { type Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppData, Settings } from "./types";

/**
 * Typed wrappers around the Rust Tauri commands. Every mutating command
 * returns the full, updated AppData so the UI stays drift-free.
 *
 * Note: Tauri v2 maps camelCase JS arg keys to snake_case Rust params, so
 * `ordered_ids` on the Rust side is sent here as `orderedIds`.
 */

export function getAppState(): Promise<AppData> {
  return invoke<AppData>("get_app_state");
}

export function addProject(path: string, name: string, color: string): Promise<AppData> {
  return invoke<AppData>("add_project", { path, name, color });
}

export function removeProject(id: string): Promise<AppData> {
  return invoke<AppData>("remove_project", { id });
}

export function renameProject(id: string, name: string): Promise<AppData> {
  return invoke<AppData>("rename_project", { id, name });
}

export function setProjectColor(id: string, color: string): Promise<AppData> {
  return invoke<AppData>("set_project_color", { id, color });
}

export function reorderProjects(orderedIds: string[]): Promise<AppData> {
  return invoke<AppData>("reorder_projects", { orderedIds });
}

export function setActiveProject(id: string | null): Promise<AppData> {
  return invoke<AppData>("set_active_project", { id });
}

export function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export function updateSettings(settings: Settings): Promise<Settings> {
  return invoke<Settings>("update_settings", { settings });
}

/** Open the native folder picker. Returns the chosen absolute path, or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

/**
 * PTY (terminal) commands. Output is streamed back over a Tauri Channel as raw
 * bytes (ArrayBuffer), which xterm writes directly. Keystrokes and resizes are
 * low-volume, so they go through plain invoke calls.
 */

export interface SpawnOptions {
  tabId: string;
  cwd: string;
  cols: number;
  rows: number;
  startupCommand: string | null;
}

export function spawnPty(options: SpawnOptions, onData: Channel<ArrayBuffer>): Promise<void> {
  return invoke("pty_spawn", { options, onData });
}

export function writePty(tabId: string, data: string): Promise<void> {
  return invoke("pty_write", { tabId, data });
}

export function resizePty(tabId: string, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { tabId, cols, rows });
}

export function killPty(tabId: string): Promise<void> {
  return invoke("pty_kill", { tabId });
}

export interface PtyExit {
  tabId: string;
  exitCode: number;
}

/** Subscribe to the one-shot "process exited" signal for any PTY. */
export function onPtyExit(handler: (event: PtyExit) => void): Promise<UnlistenFn> {
  return listen<PtyExit>("pty-exit", (event) => handler(event.payload));
}

/**
 * Embedded VS Code (IDE tab). One shared `code serve-web` process backs a native
 * child webview per project. The Rust side owns the webview lifecycle; the
 * frontend only reports the content rect to keep the webview aligned, and toggles
 * show/hide as tabs and projects switch.
 */

export type IdeServerStatus = "starting" | "ready" | "failed";

/** Content-area rectangle in logical (CSS) pixels, relative to the window. */
export interface IdeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Start (or join) the shared server; resolves with its current status. */
export function ensureIdeServer(): Promise<IdeServerStatus> {
  return invoke<IdeServerStatus>("ensure_ide_server");
}

let cachedTitleBarOffset: number | null = null;

/**
 * Vertical gap (logical px) between the native window top and the DOM viewport
 * top — the title bar. Tauri positions child webviews relative to the native
 * window top, but getBoundingClientRect is relative to the DOM viewport (below the
 * title bar), so this must be added to a measured Y before it becomes an IDE
 * webview bound, or the webview sits too high and covers the tab strip. Constant
 * per window, so it is cached after the first read.
 */
export async function titleBarOffset(): Promise<number> {
  if (cachedTitleBarOffset !== null) return cachedTitleBarOffset;
  const win = getCurrentWindow();
  const [inner, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
  cachedTitleBarOffset = Math.max(0, Math.round(inner.height / scale - window.innerHeight));
  return cachedTitleBarOffset;
}

export function createIdeWebview(projectId: string, folder: string, b: IdeBounds): Promise<void> {
  return invoke("create_ide_webview", { projectId, folder, ...b });
}

export function setIdeBounds(projectId: string, b: IdeBounds): Promise<void> {
  return invoke("set_ide_bounds", { projectId, ...b });
}

export function showIdeWebview(projectId: string, b: IdeBounds): Promise<void> {
  return invoke("show_ide_webview", { projectId, ...b });
}

export function hideIdeWebview(projectId: string): Promise<void> {
  return invoke("hide_ide_webview", { projectId });
}

export function closeIdeWebview(projectId: string): Promise<void> {
  return invoke("close_ide_webview", { projectId });
}

export function closeAllIdeWebviews(): Promise<void> {
  return invoke("close_all_ide_webviews");
}

/** Copy extensions + settings from the user's desktop VS Code into the app's
 *  own isolated directories. Returns a summary string. */
export function importFromVscode(): Promise<string> {
  return invoke<string>("import_from_vscode");
}

/** Open the native diff view for `filePath` inside the embedded IDE, via the
 *  bundled `antani-diff-bridge` extension running in `projectPath`'s IDE
 *  webview. Both must be absolute; rejects if that project's IDE webview
 *  isn't open yet (or the extension hasn't activated) — callers should retry. */
export function openDiffInIde(projectPath: string, filePath: string): Promise<void> {
  return invoke("open_diff_in_ide", { projectPath, filePath });
}

export interface IdeServerStatusEvent {
  status: IdeServerStatus;
  message: string | null;
}

/** Subscribe to server lifecycle transitions (starting / ready / crashed). */
export function onIdeServerStatus(
  handler: (event: IdeServerStatusEvent) => void,
): Promise<UnlistenFn> {
  return listen<IdeServerStatusEvent>("ide-server-status", (event) => handler(event.payload));
}

/**
 * Total RSS in MB used by the serve-web process tree, or null if the server
 * is not running. Intended for a status-bar display; poll at ~3s.
 */
export function getVscodeMemoryMb(): Promise<number | null> {
  return invoke<number | null>("get_vscode_memory_mb");
}
