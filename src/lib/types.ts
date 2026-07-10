/** TypeScript mirror of the Rust `state::Project` / `state::AppData` structs.
 *  Kept in sync manually; the Rust side serializes with camelCase. */

export interface Project {
  id: string;
  name: string;
  path: string;
  color: string;
}

export interface AppData {
  projects: Project[];
  activeProjectId: string | null;
}

export interface Settings {
  claudeCommand: string;
  opencodeCommand: string;
}
