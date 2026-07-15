import type { CustomCommand, Settings } from "./types";

export type AgentKind = "claude" | "opencode" | "codex";
export type TabKind = "terminal" | AgentKind | "ide";

/** Runtime-only status for agent tabs. Never persisted. */
export type TabStatus = "idle" | "busy" | "ready" | "waiting";

export function isAgentKind(kind: TabKind): kind is AgentKind {
  return kind === "claude" || kind === "opencode" || kind === "codex";
}

export interface Tab {
  id: string;
  kind: TabKind;
  title: string;
  /** Tab-chip color (hex from the shared palette), or null for the default look. */
  color: string | null;
  /** Command typed into the shell on spawn, snapshotted at creation so a later
   *  settings change never respawns a running tab. null = plain login shell. */
  startupCommand: string | null;
}

export interface ProjectTabs {
  tabs: Tab[];
  activeTabId: string | null;
}

/** Session-only tab state, keyed by project id. Never persisted. */
export type TabsState = Record<string, ProjectTabs>;

const EMPTY_PROJECT_TABS: ProjectTabs = { tabs: [], activeTabId: null };

const TAB_TITLES: Record<TabKind, string> = {
  terminal: "Terminal",
  claude: "Claude",
  opencode: "OpenCode",
  codex: "Codex",
  ide: "VS Code",
};

export function defaultTitle(kind: TabKind): string {
  return TAB_TITLES[kind];
}

export function startupCommandForKind(kind: TabKind, settings: Settings): string | null {
  if (kind === "claude") return settings.claudeCommand;
  if (kind === "opencode") return settings.opencodeCommand;
  if (kind === "codex") return settings.codexCommand;
  return null;
}

export function createTab(kind: TabKind, settings: Settings): Tab {
  return {
    id: crypto.randomUUID(),
    kind,
    title: TAB_TITLES[kind],
    color: null,
    startupCommand: startupCommandForKind(kind, settings),
  };
}

/** A per-project custom command opens a plain terminal-kind tab — it runs an
 *  arbitrary shell command, so it gets no AI status tracking (busy/ready/waiting). */
export function createCustomTab(cmd: CustomCommand): Tab {
  return {
    id: crypto.randomUUID(),
    kind: "terminal",
    title: cmd.name,
    color: cmd.color,
    startupCommand: cmd.command,
  };
}

export function projectTabs(state: TabsState, projectId: string): ProjectTabs {
  return state[projectId] ?? EMPTY_PROJECT_TABS;
}

/** Find which project owns a tab id, and the tab itself. */
export function findTabOwner(
  state: TabsState,
  tabId: string,
): { projectId: string; tab: Tab } | null {
  for (const [projectId, project] of Object.entries(state)) {
    const tab = project.tabs.find((t) => t.id === tabId);
    if (tab) return { projectId, tab };
  }
  return null;
}

export function addTab(state: TabsState, projectId: string, tab: Tab): TabsState {
  const current = projectTabs(state, projectId);
  return {
    ...state,
    [projectId]: { tabs: [...current.tabs, tab], activeTabId: tab.id },
  };
}

export function setActiveTab(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  if (!current.tabs.some((t) => t.id === tabId)) return state;
  return { ...state, [projectId]: { ...current, activeTabId: tabId } };
}

export function closeTab(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  const index = current.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return state;
  const tabs = current.tabs.filter((t) => t.id !== tabId);
  let activeTabId = current.activeTabId;
  if (activeTabId === tabId) {
    const next = tabs[index] ?? tabs[index - 1] ?? null;
    activeTabId = next?.id ?? null;
  }
  return { ...state, [projectId]: { tabs, activeTabId } };
}

export function renameTab(
  state: TabsState,
  projectId: string,
  tabId: string,
  title: string,
): TabsState {
  const current = projectTabs(state, projectId);
  return {
    ...state,
    [projectId]: {
      ...current,
      tabs: current.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
    },
  };
}

export function recolorTab(
  state: TabsState,
  projectId: string,
  tabId: string,
  color: string,
): TabsState {
  const current = projectTabs(state, projectId);
  return {
    ...state,
    [projectId]: {
      ...current,
      tabs: current.tabs.map((t) => (t.id === tabId ? { ...t, color } : t)),
    },
  };
}

export function reorderTabs(
  state: TabsState,
  projectId: string,
  fromId: string,
  insertBeforeId: string | null,
): TabsState {
  const current = projectTabs(state, projectId);
  const tabs = current.tabs.filter((t) => t.id !== fromId);
  const dragged = current.tabs.find((t) => t.id === fromId);
  if (!dragged) return state;
  const to = insertBeforeId === null ? tabs.length : tabs.findIndex((t) => t.id === insertBeforeId);
  if (to === -1) return state;
  tabs.splice(to, 0, dragged);
  return { ...state, [projectId]: { ...current, tabs } };
}

/** Drop a project's tabs (called when the project is removed). */
export function removeProjectTabs(state: TabsState, projectId: string): TabsState {
  if (!(projectId in state)) return state;
  const next = { ...state };
  delete next[projectId];
  return next;
}
