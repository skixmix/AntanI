/** TypeScript mirror of the Rust `state::Project` / `state::AppData` structs.
 *  Kept in sync manually; the Rust side serializes with camelCase. */

export interface CustomCommand {
  id: string;
  name: string;
  command: string;
  color: string;
}

export type InjectTarget = "terminal" | "ai";

export interface Injectable {
  id: string;
  name: string;
  text: string;
  target: InjectTarget;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  color: string;
  customCommands: CustomCommand[];
  injectables: Injectable[];
}

export interface AppData {
  projects: Project[];
  activeProjectId: string | null;
}

export interface Settings {
  claudeCommand: string;
  opencodeCommand: string;
  notificationsEnabled: boolean;
  vscodeImportPrompted: boolean;
  soundEnabled: boolean;
  soundReady: string;
  soundWaiting: string;
  terminalFontSize: number;
}

export interface BackupSelection {
  readonly projects: boolean;
  readonly preferences: boolean;
  readonly vscodeProfile: boolean;
  readonly vscodeExtensions: boolean;
}

export type FileChangeKind = "added" | "modified" | "deleted";

export interface GitFileEntry {
  path: string;
  kind: FileChangeKind;
}

export interface GitStatus {
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  branch: string;
}
