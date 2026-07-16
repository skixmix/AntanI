import type { CustomCommand, Settings } from "./types";

export type AgentKind = "claude" | "opencode" | "codex";
export type TabKind = "terminal" | AgentKind | "ide";

/** Runtime-only status for agent tabs. Never persisted. */
export type TabStatus = "idle" | "busy" | "ready" | "waiting";

export type PaneId = "primary" | "secondary" | "tertiary" | "quaternary";

export const PANE_IDS: PaneId[] = ["primary", "secondary", "tertiary", "quaternary"];

/** A split can hold at most 4 tabs, arranged in a 2x2 quadrant grid. */
export const MAX_SPLIT_MEMBERS = 4;

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

/** A split is a persistent entity: it survives while at least two of its
 *  members exist, even when parked (a solo tab shown full-area), carrying its
 *  own editable title and color independent of its member tabs. `memberIds`
 *  holds 2-4 tab ids in quadrant order: 0 top-left, 1 top-right, 2
 *  bottom-left (or full-width bottom row when there's no 4th member), 3
 *  bottom-right. `ratio` is the column split (left column width), `rowRatio`
 *  is the row split (top row height) — only meaningful once a 3rd member
 *  exists. */
export interface Split {
  memberIds: string[];
  focusedPane: PaneId;
  ratio: number;
  rowRatio: number;
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

export function splitMembers(p: ProjectTabs): (Tab | null)[] {
  const split = p.split;
  if (!split || !p.viewingSplit) return [];
  return split.memberIds.map((id) => p.tabs.find((t) => t.id === id) ?? null);
}

export function activePaneTabs(p: ProjectTabs): {
  primary: Tab | null;
  secondary: Tab | null;
  tertiary: Tab | null;
  quaternary: Tab | null;
} {
  const members = splitMembers(p);
  if (members.length > 0) {
    return {
      primary: members[0] ?? null,
      secondary: members[1] ?? null,
      tertiary: members[2] ?? null,
      quaternary: members[3] ?? null,
    };
  }
  const primary = p.tabs.find((t) => t.id === p.activeTabId) ?? null;
  return { primary, secondary: null, tertiary: null, quaternary: null };
}

export function focusedTab(p: ProjectTabs): Tab | null {
  const split = p.split;
  if (split && p.viewingSplit) {
    const idx = PANE_IDS.indexOf(split.focusedPane);
    const members = splitMembers(p);
    return members[idx] ?? members[0] ?? null;
  }
  return p.tabs.find((t) => t.id === p.activeTabId) ?? null;
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
  const memberIdx = split?.memberIds.indexOf(tabId) ?? -1;
  if (split && memberIdx !== -1) {
    return {
      ...state,
      [projectId]: {
        ...current,
        viewingSplit: true,
        split: { ...split, focusedPane: PANE_IDS[memberIdx] },
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
  const memberIdx = split?.memberIds.indexOf(tabId) ?? -1;
  if (split && memberIdx !== -1) {
    return {
      ...state,
      [projectId]: {
        ...current,
        viewingSplit: true,
        split: { ...split, focusedPane: PANE_IDS[memberIdx] },
      },
    };
  }
  const existingLeft = split ? current.tabs.find((t) => t.id === split.memberIds[0]) : undefined;
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
        memberIds: [leftId, tabId],
        focusedPane: "secondary",
        ratio: split?.ratio ?? DEFAULT_SPLIT_RATIO,
        rowRatio: split?.rowRatio ?? DEFAULT_SPLIT_RATIO,
        title: split?.title ?? "Split",
        color: split?.color ?? null,
      },
      viewingSplit: true,
    },
  };
}

/** Appends a tab to the currently open split, growing it toward the 2x2
 *  quadrant grid (capped at MAX_SPLIT_MEMBERS). No-op without an existing
 *  split — starting one is `openTabToSide`'s job. */
export function addToSplit(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  const split = current.split;
  if (!split) return state;
  const target = current.tabs.find((t) => t.id === tabId);
  if (!target || target.kind === "ide") return state;
  if (split.memberIds.includes(tabId) || split.memberIds.length >= MAX_SPLIT_MEMBERS) {
    return state;
  }
  const memberIds = [...split.memberIds, tabId];
  return {
    ...state,
    [projectId]: {
      ...current,
      split: { ...split, memberIds, focusedPane: PANE_IDS[memberIds.length - 1] },
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
      activeTabId: current.split?.memberIds[0] ?? current.activeTabId,
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

/** The row split (top row height) only applies once a 3rd member exists. */
export function setSplitRowRatio(state: TabsState, projectId: string, ratio: number): TabsState {
  const current = projectTabs(state, projectId);
  if (!Number.isFinite(ratio) || !current.split || current.split.memberIds.length < 3) {
    return state;
  }
  const clamped = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
  return {
    ...state,
    [projectId]: { ...current, split: { ...current.split, rowRatio: clamped } },
  };
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

/** Swap two arbitrary quadrant slots (drag-to-swap any pane onto any other).
 *  focusedPane flips along with the swapped pair too, so the same tab stays
 *  focused after the swap, not merely the same slot. */
export function swapPanes(
  state: TabsState,
  projectId: string,
  paneA: PaneId,
  paneB: PaneId,
): TabsState {
  const current = projectTabs(state, projectId);
  const split = current.split;
  if (!split) return state;
  const idxA = PANE_IDS.indexOf(paneA);
  const idxB = PANE_IDS.indexOf(paneB);
  if (
    idxA === -1 ||
    idxB === -1 ||
    idxA >= split.memberIds.length ||
    idxB >= split.memberIds.length
  ) {
    return state;
  }
  const memberIds = [...split.memberIds];
  [memberIds[idxA], memberIds[idxB]] = [memberIds[idxB], memberIds[idxA]];
  const focusedPane =
    split.focusedPane === paneA ? paneB : split.focusedPane === paneB ? paneA : split.focusedPane;
  return {
    ...state,
    [projectId]: { ...current, split: { ...split, memberIds, focusedPane } },
  };
}

export function closeTab(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  const index = current.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return state;
  const newTabs = current.tabs.filter((t) => t.id !== tabId);
  const split = current.split;
  if (split?.memberIds.includes(tabId)) {
    const closedIdx = split.memberIds.indexOf(tabId);
    const remaining = split.memberIds.filter((id) => id !== tabId);
    if (remaining.length <= 1) {
      return {
        ...state,
        [projectId]: {
          ...current,
          tabs: newTabs,
          split: null,
          viewingSplit: false,
          activeTabId: remaining[0] ?? current.activeTabId,
        },
      };
    }
    // Keep focus on the same tab if it survived; otherwise fall back to
    // whichever pane now holds the closed member's old slot (clamped to the
    // shrunk grid), defaulting to primary.
    const focusedIdx = PANE_IDS.indexOf(split.focusedPane);
    const focusedId = split.memberIds[focusedIdx];
    const survivedFocusIdx = focusedId ? remaining.indexOf(focusedId) : -1;
    const focusedPane =
      survivedFocusIdx !== -1
        ? PANE_IDS[survivedFocusIdx]
        : (PANE_IDS[Math.min(closedIdx, remaining.length - 1)] ?? "primary");
    return {
      ...state,
      [projectId]: {
        ...current,
        tabs: newTabs,
        split: { ...split, memberIds: remaining, focusedPane },
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
    const isMember = (id: string) => split?.memberIds.includes(id);
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
