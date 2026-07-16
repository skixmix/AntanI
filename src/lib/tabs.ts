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
 *  members exist, even when parked (a different tab or split shown
 *  full-area), carrying its own editable title and color independent of its
 *  member tabs. `memberIds` holds 2-4 tab ids in quadrant order: 0 top-left,
 *  1 top-right, 2 bottom-left (or full-width bottom row when there's no 4th
 *  member), 3 bottom-right. `ratio` is the column split (left column width),
 *  `rowRatio` is the row split (top row height) — only meaningful once a 3rd
 *  member exists. A project can hold several independent splits at once; each
 *  is its own chip in the tab strip. A tab belongs to at most one split. */
export interface Split {
  id: string;
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
  splits: Split[];
  /** id of the split currently shown full-area, or null when the solo
   *  activeTabId is shown instead. */
  viewingSplitId: string | null;
}

/** Session-only tab state, keyed by project id. Never persisted. */
export type TabsState = Record<string, ProjectTabs>;

export const MIN_SPLIT_RATIO = 0.2;
export const MAX_SPLIT_RATIO = 0.8;
export const DEFAULT_SPLIT_RATIO = 0.5;

const EMPTY_PROJECT_TABS: ProjectTabs = {
  tabs: [],
  activeTabId: null,
  splits: [],
  viewingSplitId: null,
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

/** The split a tab belongs to, if any. A tab is a member of at most one split. */
function findSplitByMember(p: ProjectTabs, tabId: string): Split | undefined {
  return p.splits.find((s) => s.memberIds.includes(tabId));
}

/** The split currently shown full-area, or null when a solo tab is shown instead. */
function viewedSplit(p: ProjectTabs): Split | null {
  if (!p.viewingSplitId) return null;
  return p.splits.find((s) => s.id === p.viewingSplitId) ?? null;
}

export function splitMembers(p: ProjectTabs): (Tab | null)[] {
  const split = viewedSplit(p);
  if (!split) return [];
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
  const split = viewedSplit(p);
  if (split) {
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
      viewingSplitId: null,
    },
  };
}

export function setActiveTab(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  const target = current.tabs.find((t) => t.id === tabId);
  if (!target) return state;
  const owner = findSplitByMember(current, tabId);
  if (owner) {
    const memberIdx = owner.memberIds.indexOf(tabId);
    return {
      ...state,
      [projectId]: {
        ...current,
        activeTabId: null,
        viewingSplitId: owner.id,
        splits: current.splits.map((s) =>
          s.id === owner.id ? { ...s, focusedPane: PANE_IDS[memberIdx] } : s,
        ),
      },
    };
  }
  return { ...state, [projectId]: { ...current, activeTabId: tabId, viewingSplitId: null } };
}

export function viewSplit(state: TabsState, projectId: string, splitId: string): TabsState {
  const current = projectTabs(state, projectId);
  if (!current.splits.some((s) => s.id === splitId)) return state;
  return { ...state, [projectId]: { ...current, activeTabId: null, viewingSplitId: splitId } };
}

/** Starts a fresh split from the active solo tab + target, or if the target
 *  already belongs to a split, just views that split. */
export function openTabToSide(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  const target = current.tabs.find((t) => t.id === tabId);
  if (!target || target.kind === "ide") return state;
  const owner = findSplitByMember(current, tabId);
  if (owner) {
    const memberIdx = owner.memberIds.indexOf(tabId);
    return {
      ...state,
      [projectId]: {
        ...current,
        activeTabId: null,
        viewingSplitId: owner.id,
        splits: current.splits.map((s) =>
          s.id === owner.id ? { ...s, focusedPane: PANE_IDS[memberIdx] } : s,
        ),
      },
    };
  }
  const activeTab = current.activeTabId
    ? current.tabs.find((t) => t.id === current.activeTabId)
    : undefined;
  const leftId =
    activeTab && activeTab.kind !== "ide" && activeTab.id !== tabId
      ? activeTab.id
      : (current.tabs.find(
          (t) => t.kind !== "ide" && t.id !== tabId && !findSplitByMember(current, t.id),
        )?.id ?? null);
  if (!leftId) {
    return { ...state, [projectId]: { ...current, activeTabId: tabId, viewingSplitId: null } };
  }
  const newSplit: Split = {
    id: crypto.randomUUID(),
    memberIds: [leftId, tabId],
    focusedPane: "secondary",
    ratio: DEFAULT_SPLIT_RATIO,
    rowRatio: DEFAULT_SPLIT_RATIO,
    title: "Split",
    color: null,
  };
  return {
    ...state,
    [projectId]: {
      ...current,
      activeTabId: null,
      splits: [...current.splits, newSplit],
      viewingSplitId: newSplit.id,
    },
  };
}

/** Appends a tab to the given split, growing it toward the 2x2 quadrant grid
 *  (capped at MAX_SPLIT_MEMBERS). No-op without a matching split — starting
 *  one is `openTabToSide`'s job. */
export function addToSplit(
  state: TabsState,
  projectId: string,
  splitId: string,
  tabId: string,
): TabsState {
  const current = projectTabs(state, projectId);
  const split = current.splits.find((s) => s.id === splitId);
  if (!split) return state;
  const target = current.tabs.find((t) => t.id === tabId);
  if (!target || target.kind === "ide") return state;
  if (
    split.memberIds.includes(tabId) ||
    split.memberIds.length >= MAX_SPLIT_MEMBERS ||
    findSplitByMember(current, tabId)
  ) {
    return state;
  }
  const memberIds = [...split.memberIds, tabId];
  return {
    ...state,
    [projectId]: {
      ...current,
      activeTabId: null,
      splits: current.splits.map((s) =>
        s.id === splitId ? { ...s, memberIds, focusedPane: PANE_IDS[memberIds.length - 1] } : s,
      ),
      viewingSplitId: splitId,
    },
  };
}

export function unsplit(state: TabsState, projectId: string, splitId: string): TabsState {
  const current = projectTabs(state, projectId);
  const split = current.splits.find((s) => s.id === splitId);
  if (!split) return state;
  const wasViewing = current.viewingSplitId === splitId;
  return {
    ...state,
    [projectId]: {
      ...current,
      splits: current.splits.filter((s) => s.id !== splitId),
      viewingSplitId: wasViewing ? null : current.viewingSplitId,
      activeTabId: wasViewing ? (split.memberIds[0] ?? current.activeTabId) : current.activeTabId,
    },
  };
}

export function setFocusedPane(
  state: TabsState,
  projectId: string,
  splitId: string,
  pane: PaneId,
): TabsState {
  const current = projectTabs(state, projectId);
  if (!current.splits.some((s) => s.id === splitId)) return state;
  return {
    ...state,
    [projectId]: {
      ...current,
      activeTabId: null,
      viewingSplitId: splitId,
      splits: current.splits.map((s) => (s.id === splitId ? { ...s, focusedPane: pane } : s)),
    },
  };
}

export function setSplitRatio(
  state: TabsState,
  projectId: string,
  splitId: string,
  ratio: number,
): TabsState {
  const current = projectTabs(state, projectId);
  if (!Number.isFinite(ratio) || !current.splits.some((s) => s.id === splitId)) return state;
  const clamped = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
  return {
    ...state,
    [projectId]: {
      ...current,
      splits: current.splits.map((s) => (s.id === splitId ? { ...s, ratio: clamped } : s)),
    },
  };
}

/** The row split (top row height) only applies once a 3rd member exists. */
export function setSplitRowRatio(
  state: TabsState,
  projectId: string,
  splitId: string,
  ratio: number,
): TabsState {
  const current = projectTabs(state, projectId);
  const split = current.splits.find((s) => s.id === splitId);
  if (!Number.isFinite(ratio) || !split || split.memberIds.length < 3) return state;
  const clamped = Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
  return {
    ...state,
    [projectId]: {
      ...current,
      splits: current.splits.map((s) => (s.id === splitId ? { ...s, rowRatio: clamped } : s)),
    },
  };
}

export function renameSplit(
  state: TabsState,
  projectId: string,
  splitId: string,
  title: string,
): TabsState {
  const current = projectTabs(state, projectId);
  if (!current.splits.some((s) => s.id === splitId)) return state;
  return {
    ...state,
    [projectId]: {
      ...current,
      splits: current.splits.map((s) => (s.id === splitId ? { ...s, title } : s)),
    },
  };
}

export function recolorSplit(
  state: TabsState,
  projectId: string,
  splitId: string,
  color: string,
): TabsState {
  const current = projectTabs(state, projectId);
  if (!current.splits.some((s) => s.id === splitId)) return state;
  return {
    ...state,
    [projectId]: {
      ...current,
      splits: current.splits.map((s) => (s.id === splitId ? { ...s, color } : s)),
    },
  };
}

/** Swap two arbitrary quadrant slots (drag-to-swap any pane onto any other).
 *  focusedPane flips along with the swapped pair too, so the same tab stays
 *  focused after the swap, not merely the same slot. */
export function swapPanes(
  state: TabsState,
  projectId: string,
  splitId: string,
  paneA: PaneId,
  paneB: PaneId,
): TabsState {
  const current = projectTabs(state, projectId);
  const split = current.splits.find((s) => s.id === splitId);
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
    [projectId]: {
      ...current,
      splits: current.splits.map((s) => (s.id === splitId ? { ...s, memberIds, focusedPane } : s)),
    },
  };
}

export function closeTab(state: TabsState, projectId: string, tabId: string): TabsState {
  const current = projectTabs(state, projectId);
  const index = current.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) return state;
  const newTabs = current.tabs.filter((t) => t.id !== tabId);
  const owner = findSplitByMember(current, tabId);

  if (owner) {
    const closedIdx = owner.memberIds.indexOf(tabId);
    const remaining = owner.memberIds.filter((id) => id !== tabId);
    const wasViewing = current.viewingSplitId === owner.id;
    if (remaining.length <= 1) {
      return {
        ...state,
        [projectId]: {
          ...current,
          tabs: newTabs,
          splits: current.splits.filter((s) => s.id !== owner.id),
          viewingSplitId: wasViewing ? null : current.viewingSplitId,
          activeTabId: wasViewing ? (remaining[0] ?? current.activeTabId) : current.activeTabId,
        },
      };
    }
    // Keep focus on the same tab if it survived; otherwise fall back to
    // whichever pane now holds the closed member's old slot (clamped to the
    // shrunk grid), defaulting to primary.
    const focusedIdx = PANE_IDS.indexOf(owner.focusedPane);
    const focusedId = owner.memberIds[focusedIdx];
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
        splits: current.splits.map((s) =>
          s.id === owner.id ? { ...s, memberIds: remaining, focusedPane } : s,
        ),
      },
    };
  }

  let activeTabId = current.activeTabId;
  let viewingSplitId = current.viewingSplitId;
  if (tabId === current.activeTabId) {
    // The next solo view must skip split members. They have no solo chip (the
    // strip shows them only as their split's merged chip), so pointing
    // activeTabId at one while parked would display it full-area with nothing
    // active in the strip. When only members remain, fall back to viewing a split.
    const isMember = (id: string) => current.splits.some((s) => s.memberIds.includes(id));
    const neighbor = newTabs[index] ?? newTabs[index - 1] ?? null;
    if (neighbor && !isMember(neighbor.id)) {
      activeTabId = neighbor.id;
    } else {
      const solo = newTabs.find((t) => !isMember(t.id));
      if (solo) {
        activeTabId = solo.id;
      } else if (current.splits.length > 0) {
        activeTabId = null;
        viewingSplitId = current.splits[0].id;
      } else {
        activeTabId = neighbor?.id ?? null;
      }
    }
  }
  return { ...state, [projectId]: { ...current, tabs: newTabs, activeTabId, viewingSplitId } };
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

/** Reorders tab-strip chips. `fromId`/`insertBeforeId` may each be a tab id or
 *  a split id — a split's chip drags/drops as its whole member block, and a
 *  split always resolves to its first member's position (a split's chip
 *  position in the strip is always its first member's position in `tabs`). */
export function reorderTabs(
  state: TabsState,
  projectId: string,
  fromId: string,
  insertBeforeId: string | null,
): TabsState {
  const current = projectTabs(state, projectId);
  const fromSplit = current.splits.find((s) => s.id === fromId);
  const movingIds = fromSplit ? fromSplit.memberIds : [fromId];
  const movingTabs = movingIds
    .map((id) => current.tabs.find((t) => t.id === id))
    .filter((t): t is Tab => t != null);
  if (movingTabs.length === 0) return state;

  const insertBeforeSplit = insertBeforeId
    ? current.splits.find((s) => s.id === insertBeforeId)
    : undefined;
  const resolvedInsertBeforeId = insertBeforeSplit
    ? insertBeforeSplit.memberIds[0]
    : insertBeforeId;

  const tabs = current.tabs.filter((t) => !movingIds.includes(t.id));
  const to =
    resolvedInsertBeforeId === null
      ? tabs.length
      : tabs.findIndex((t) => t.id === resolvedInsertBeforeId);
  if (to === -1) return state;
  tabs.splice(to, 0, ...movingTabs);
  return { ...state, [projectId]: { ...current, tabs } };
}

/** Drop a project's tabs (called when the project is removed). */
export function removeProjectTabs(state: TabsState, projectId: string): TabsState {
  if (!(projectId in state)) return state;
  const next = { ...state };
  delete next[projectId];
  return next;
}
