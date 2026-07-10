import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppData } from "./types";

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

/** Open the native folder picker. Returns the chosen absolute path, or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}
