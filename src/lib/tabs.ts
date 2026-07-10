import type { Settings } from "./types";

export type TabKind = "terminal" | "claude" | "opencode" | "ide";

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
  opencode: "opencode",
  ide: "IDE",
};

export function defaultTitle(kind: TabKind): string {
  return TAB_TITLES[kind];
}

export function startupCommandForKind(kind: TabKind, settings: Settings): string | null {
  if (kind === "claude") return settings.claudeCommand;
  if (kind === "opencode") return settings.opencodeCommand;
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

export function projectTabs(state: TabsState, projectId: string): ProjectTabs {
  return state[projectId] ?? EMPTY_PROJECT_TABS;
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

/** Drop a project's tabs (called when the project is removed). */
export function removeProjectTabs(state: TabsState, projectId: string): TabsState {
  if (!(projectId in state)) return state;
  const next = { ...state };
  delete next[projectId];
  return next;
}
