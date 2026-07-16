import type { CustomCommand, Settings } from "./types";

export type AgentKind = "claude" | "opencode" | "codex";
export type TabKind = "terminal" | AgentKind | "ide";

/** Runtime-only status for agent tabs. Never persisted. */
export type TabStatus = "idle" | "busy" | "ready" | "waiting";

export type PaneId = "primary" | "secondary";

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

/** A split is a persistent entity: it survives while its two members exist,
 *  even when parked (a solo tab shown full-area), carrying its own editable
 *  title and color independent of its member tabs. */
export interface Split {
  leftId: string;
  rightId: string;
  focusedPane: PaneId;
  ratio: number;
  title: string;
  color: string | null;
}

export interface ProjectTabs {
  tabs: Tab[];
  activeTabId: string | null;
  split: Split | null;
  /** true => the split is the current view; false => the solo activeTabId is shown. */
  viewingSplit: boolean;
}

/** Session-only tab state, keyed by project id. Never persisted. */
export type TabsState = Record<string, ProjectTabs>;

export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;
export const DEFAULT_SPLIT_RATIO = 0.5;

const EMPTY_PROJECT_TABS: ProjectTabs = {
  tabs: [],
  activeTabId: null,
  split: null,
  viewingSplit: false,
};

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

export function activePaneTabs(p: ProjectTabs): { primary: Tab | null; secondary: Tab | null } {
  const split = p.split;
  if (split && p.viewingSplit) {
    const primary = p.tabs.find((t) => t.id === split.leftId) ?? null;
    const raw = p.tabs.find((t) => t.id === split.rightId) ?? null;
    const secondary =
      raw && primary && raw.id !== primary.id && raw.kind !== "ide" && primary.kind !== "ide"
        ? raw
        : null;
    return { primary, secondary };
  }
  const primary = p.tabs.find((t) => t.id === p.activeTabId) ?? null;
  return { primary, secondary: null };
}

export function focusedTab(p: ProjectTabs): Tab | null {
  const { primary, secondary } = activePaneTabs(p);
  if (p.split && p.viewingSplit && p.split.focusedPane === "secondary" && secondary) {
    return secondary;
  }
  return primary;
}

export function addTab(state: TabsState, projectId: string, tab: Tab): TabsState {
  const current = projectTabs(state, projectId);
  return {
    ...state,
    [projectId]: {
      ...current,
      tabs: [...current.tabs, tab],
      activeTabId: tab.id,
      viewingSplit: false,
    },
  };
}

export function setActiveTab(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  const target = current.tabs.find((t) => t.id === tabId);
  if (!target) return state;
  const split = current.split;
  if (split && (tabId === split.leftId || tabId === split.rightId)) {
    return {
      ...state,
      [projectId]: {
        ...current,
        viewingSplit: true,
        split: { ...split, focusedPane: tabId === split.rightId ? "secondary" : "primary" },
      },
    };
  }
  return { ...state, [projectId]: { ...current, activeTabId: tabId, viewingSplit: false } };
}

export function viewSplit(state: TabsState, projectId: string): TabsState {
  const current = projectTabs(state, projectId);
  if (!current.split) return state;
  return { ...state, [projectId]: { ...current, viewingSplit: true } };
}

export function openTabToSide(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  const target = current.tabs.find((t) => t.id === tabId);
  if (!target || target.kind === "ide") return state;
  const split = current.split;
  if (split && tabId === split.rightId) {
    return {
      ...state,
      [projectId]: {
        ...current,
        viewingSplit: true,
        split: { ...split, focusedPane: "secondary" },
      },
    };
  }
  const existingLeft = split ? current.tabs.find((t) => t.id === split.leftId) : undefined;
  const activeTab = current.activeTabId
    ? current.tabs.find((t) => t.id === current.activeTabId)
    : undefined;
  let leftId: string | null = null;
  if (activeTab && activeTab.kind !== "ide" && activeTab.id !== tabId) {
    leftId = activeTab.id;
  } else if (existingLeft && existingLeft.kind !== "ide" && existingLeft.id !== tabId) {
    leftId = existingLeft.id;
  } else {
    leftId = current.tabs.find((t) => t.kind !== "ide" && t.id !== tabId)?.id ?? null;
  }
  if (!leftId) {
    return { ...state, [projectId]: { ...current, activeTabId: tabId, viewingSplit: false } };
  }
  return {
    ...state,
    [projectId]: {
      ...current,
      split: {
        leftId,
        rightId: tabId,
        focusedPane: "secondary",
        ratio: split?.ratio ?? DEFAULT_SPLIT_RATIO,
        title: split?.title ?? "Split",
        color: split?.color ?? null,
      },
      viewingSplit: true,
    },
  };
}

export function unsplit(state: TabsState, projectId: string): TabsState {
  const current = projectTabs(state, projectId);
  return {
    ...state,
    [projectId]: {
      ...current,
      split: null,
      viewingSplit: false,
      activeTabId: current.split?.leftId ?? current.activeTabId,
    },
  };
}

export function setFocusedPane(state: TabsState, projectId: string, pane: PaneId): TabsState {
  const current = projectTabs(state, projectId);
  const split = current.split;
  if (!split) return state;
  return {
    ...state,
    [projectId]: { ...current, viewingSplit: true, split: { ...split, focusedPane: pane } },
  };
}

export function setSplitRatio(state: TabsState, projectId: string, ratio: number): TabsState {
  const current = projectTabs(state, projectId);
  if (!Number.isFinite(ratio) || !current.split) return state;
  const clamped = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
  return { ...state, [projectId]: { ...current, split: { ...current.split, ratio: clamped } } };
}

export function renameSplit(state: TabsState, projectId: string, title: string): TabsState {
  const current = projectTabs(state, projectId);
  if (!current.split) return state;
  return { ...state, [projectId]: { ...current, split: { ...current.split, title } } };
}

export function recolorSplit(state: TabsState, projectId: string, color: string): TabsState {
  const current = projectTabs(state, projectId);
  if (!current.split) return state;
  return { ...state, [projectId]: { ...current, split: { ...current.split, color } } };
}

/** Swap which member sits on the left vs right. focusedPane flips too so the
 *  same tab stays focused after the swap, not merely the same side. */
export function swapPanes(state: TabsState, projectId: string): TabsState {
  const current = projectTabs(state, projectId);
  const split = current.split;
  if (!split) return state;
  return {
    ...state,
    [projectId]: {
      ...current,
      split: {
        ...split,
        leftId: split.rightId,
        rightId: split.leftId,
        focusedPane: split.focusedPane === "primary" ? "secondary" : "primary",
      },
    },
  };
}

export function closeTab(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  const index = current.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return state;
  const newTabs = current.tabs.filter((t) => t.id !== tabId);
  const split = current.split;
  if (split && (tabId === split.leftId || tabId === split.rightId)) {
    const survivorId = tabId === split.leftId ? split.rightId : split.leftId;
    return {
      ...state,
      [projectId]: {
        ...current,
        tabs: newTabs,
        split: null,
        viewingSplit: false,
        activeTabId: survivorId,
      },
    };
  }
  let activeTabId = current.activeTabId;
  let viewingSplit = current.viewingSplit;
  if (tabId === current.activeTabId) {
    // The next solo view must skip split members. They have no solo chip (the
    // strip shows them only as the merged split chip), so pointing activeTabId
    // at one while parked would display it full-area with nothing active in the
    // strip. When only members remain, fall back to viewing the split itself.
    const isMember = (id: string) =>
      split !== null && (id === split.leftId || id === split.rightId);
    const neighbor = newTabs[index] ?? newTabs[index - 1] ?? null;
    if (neighbor && !isMember(neighbor.id)) {
      activeTabId = neighbor.id;
    } else {
      const solo = newTabs.find((t) => !isMember(t.id));
      if (solo) {
        activeTabId = solo.id;
      } else if (split) {
        activeTabId = null;
        viewingSplit = true;
      } else {
        activeTabId = neighbor?.id ?? null;
      }
    }
  }
  return { ...state, [projectId]: { ...current, tabs: newTabs, activeTabId, viewingSplit } };
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
