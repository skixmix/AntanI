import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FileChangeKind, GitStatus } from "./types";

/**
 * Git status commands. All operate purely on local repository state — no
 * `fetch`/`ls-remote` is ever issued, so these never touch the network.
 */

export function gitStatus(projectPath: string): Promise<GitStatus> {
  return invoke<GitStatus>("git_status", { projectPath });
}

export function gitStage(projectPath: string, paths: string[]): Promise<void> {
  return invoke("git_stage", { projectPath, paths });
}

export function gitUnstage(projectPath: string, paths: string[]): Promise<void> {
  return invoke("git_unstage", { projectPath, paths });
}

export function gitStageAll(projectPath: string): Promise<void> {
  return invoke("git_stage_all", { projectPath });
}

export function gitUnstageAll(projectPath: string): Promise<void> {
  return invoke("git_unstage_all", { projectPath });
}

export function gitRevertFile(
  projectPath: string,
  path: string,
  kind: FileChangeKind,
): Promise<void> {
  return invoke("git_revert_file", { projectPath, path, kind });
}

/** Start (idempotently) the background poller for a project. Emits `git-status-changed`
 *  whenever the working tree status changes; ~2s poll interval, local-only. */
export function gitWatchStart(projectId: string, projectPath: string): Promise<void> {
  return invoke("git_watch_start", { projectId, projectPath });
}

export function gitWatchStop(projectId: string): Promise<void> {
  return invoke("git_watch_stop", { projectId });
}

export interface GitStatusChanged {
  projectId: string;
  status: GitStatus;
}

/** Subscribe to background git-status updates for any watched project. */
export function onGitStatusChanged(
  handler: (event: GitStatusChanged) => void,
): Promise<UnlistenFn> {
  return listen<GitStatusChanged>("git-status-changed", (event) => handler(event.payload));
}
