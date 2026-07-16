import { describe, expect, it } from "vitest";
import {
  activePaneTabs,
  addTab,
  closeTab,
  createCustomTab,
  createTab,
  defaultTitle,
  findTabOwner,
  focusedTab,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  openTabToSide,
  type PaneId,
  type ProjectTabs,
  projectTabs,
  recolorSplit,
  recolorTab,
  removeProjectTabs,
  renameSplit,
  renameTab,
  reorderTabs,
  type Split,
  setActiveTab,
  setFocusedPane,
  setSplitRatio,
  startupCommandForKind,
  swapPanes,
  type Tab,
  type TabsState,
  unsplit,
  viewSplit,
} from "./tabs";
import type { CustomCommand, Settings } from "./types";

const SETTINGS: Settings = {
  claudeCommand: "claude --resume",
  opencodeCommand: "oc",
  codexCommand: "codex --oss",
  notificationsEnabled: true,
  vscodeImportPrompted: true,
  soundEnabled: true,
  soundReady: "Glass",
  soundWaiting: "Ping",
  terminalFontSize: 14,
};
const PROJECT = "proj-1";

function seed(kinds: Parameters<typeof createTab>[0][]): TabsState {
  let state: TabsState = {};
  for (const kind of kinds) {
    state = addTab(state, PROJECT, createTab(kind, SETTINGS));
  }
  return state;
}

function mkTab(id: string, kind: Tab["kind"]): Tab {
  return { id, kind, title: id, color: null, startupCommand: null };
}

function mkSplit(leftId: string, rightId: string, focusedPane: PaneId = "primary"): Split {
  return { leftId, rightId, focusedPane, ratio: 0.5, title: "Split", color: null };
}

function pt(
  tabs: Tab[],
  activeTabId: string | null,
  split: Split | null = null,
  viewingSplit = false,
): ProjectTabs {
  return { tabs, activeTabId, split, viewingSplit };
}

function seedSplit(): { state: TabsState; a: Tab; b: Tab; c: Tab } {
  const base = seed(["terminal", "terminal", "terminal"]);
  const [a, b, c] = projectTabs(base, PROJECT).tabs;
  const withA = setActiveTab(base, PROJECT, a.id);
  const split = openTabToSide(withA, PROJECT, b.id);
  return { state: split, a, b, c };
}

describe("startupCommandForKind", () => {
  it("uses the configured commands for agent tabs and none for plain terminals", () => {
    expect(startupCommandForKind("claude", SETTINGS)).toBe("claude --resume");
    expect(startupCommandForKind("opencode", SETTINGS)).toBe("oc");
    expect(startupCommandForKind("codex", SETTINGS)).toBe("codex --oss");
    expect(startupCommandForKind("terminal", SETTINGS)).toBeNull();
    expect(startupCommandForKind("ide", SETTINGS)).toBeNull();
  });
});

describe("defaultTitle", () => {
  it("labels each tab kind", () => {
    expect(defaultTitle("terminal")).toBe("Terminal");
    expect(defaultTitle("claude")).toBe("Claude");
    expect(defaultTitle("opencode")).toBe("OpenCode");
    expect(defaultTitle("codex")).toBe("Codex");
    expect(defaultTitle("ide")).toBe("VS Code");
  });
});

describe("createCustomTab", () => {
  it("builds a terminal-kind tab from a custom command", () => {
    const cmd: CustomCommand = { id: "c1", name: "Build", command: "make build", color: "#3b82f6" };
    const tab = createCustomTab(cmd);
    expect(tab.kind).toBe("terminal");
    expect(tab.title).toBe("Build");
    expect(tab.color).toBe("#3b82f6");
    expect(tab.startupCommand).toBe("make build");
  });
});

describe("addTab", () => {
  it("appends the tab and makes it the active solo tab", () => {
    const state = seed(["terminal", "claude"]);
    const p = projectTabs(state, PROJECT);
    expect(p.tabs).toHaveLength(2);
    expect(p.activeTabId).toBe(p.tabs[1].id);
    expect(p.viewingSplit).toBe(false);
  });

  it("snapshots the launch command onto the tab", () => {
    const state = seed(["claude"]);
    expect(projectTabs(state, PROJECT).tabs[0].startupCommand).toBe("claude --resume");
  });

  it("parks an existing split, leaving it intact", () => {
    const { state, a, b } = seedSplit();
    const tab = createTab("claude", SETTINGS);
    const next = addTab(state, PROJECT, tab);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(tab.id);
    expect(p.viewingSplit).toBe(false);
    expect(p.split).toEqual(expect.objectContaining({ leftId: a.id, rightId: b.id }));
  });
});

describe("closeTab", () => {
  it("selects the right-hand neighbor when closing the active tab", () => {
    const state = seed(["terminal", "claude", "opencode"]);
    const [t0, t1, t2] = projectTabs(state, PROJECT).tabs;
    const afterActivateMiddle = setActiveTab(state, PROJECT, t1.id);
    const closed = closeTab(afterActivateMiddle, PROJECT, t1.id);
    const p = projectTabs(closed, PROJECT);
    expect(p.tabs.map((t) => t.id)).toEqual([t0.id, t2.id]);
    expect(p.activeTabId).toBe(t2.id);
  });

  it("falls back to the left neighbor when closing the last active tab", () => {
    const state = seed(["terminal", "claude"]);
    const [t0, t1] = projectTabs(state, PROJECT).tabs;
    const closed = closeTab(state, PROJECT, t1.id);
    expect(projectTabs(closed, PROJECT).activeTabId).toBe(t0.id);
  });

  it("clears active when the final tab is closed", () => {
    const state = seed(["terminal"]);
    const only = projectTabs(state, PROJECT).tabs[0].id;
    const closed = closeTab(state, PROJECT, only);
    const p = projectTabs(closed, PROJECT);
    expect(p.tabs).toHaveLength(0);
    expect(p.activeTabId).toBeNull();
  });

  it("keeps the active tab when a different, non-active tab is closed", () => {
    const state = seed(["terminal", "claude", "opencode"]);
    const [t0, t1, t2] = projectTabs(state, PROJECT).tabs;
    const closed = closeTab(state, PROJECT, t0.id);
    const p = projectTabs(closed, PROJECT);
    expect(p.activeTabId).toBe(t2.id);
    expect(p.tabs.map((t) => t.id)).toEqual([t1.id, t2.id]);
  });

  it("is a no-op for an unknown tab id", () => {
    const state = seed(["terminal"]);
    const next = closeTab(state, PROJECT, "missing");
    expect(next).toBe(state);
  });
});

describe("removeProjectTabs", () => {
  it("drops all tabs for a removed project", () => {
    const state = seed(["terminal", "claude"]);
    const pruned = removeProjectTabs(state, PROJECT);
    expect(projectTabs(pruned, PROJECT).tabs).toHaveLength(0);
  });

  it("is a no-op when the project has no tabs", () => {
    const state = seed(["terminal"]);
    const pruned = removeProjectTabs(state, "other-project");
    expect(pruned).toBe(state);
  });
});

describe("projectTabs", () => {
  it("returns an empty shape for an unknown project", () => {
    expect(projectTabs({}, PROJECT)).toEqual({
      tabs: [],
      activeTabId: null,
      split: null,
      viewingSplit: false,
    });
  });
});

describe("findTabOwner", () => {
  it("finds the project and tab for a known tab id", () => {
    const state = seed(["terminal", "claude"]);
    const [, t1] = projectTabs(state, PROJECT).tabs;
    expect(findTabOwner(state, t1.id)).toEqual({ projectId: PROJECT, tab: t1 });
  });

  it("returns null for an unknown tab id", () => {
    const state = seed(["terminal"]);
    expect(findTabOwner(state, "missing")).toBeNull();
  });
});

describe("setActiveTab", () => {
  it("switches the active solo tab and clears viewingSplit", () => {
    const state = seed(["terminal", "claude"]);
    const [t0] = projectTabs(state, PROJECT).tabs;
    const next = setActiveTab(state, PROJECT, t0.id);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(t0.id);
    expect(p.viewingSplit).toBe(false);
  });

  it("is a no-op for an unknown tab id", () => {
    const state = seed(["terminal"]);
    const next = setActiveTab(state, PROJECT, "missing");
    expect(next).toBe(state);
  });

  it("parks the split when a solo tab is selected, preserving the split", () => {
    const { state, a, b, c } = seedSplit();
    const next = setActiveTab(state, PROJECT, c.id);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(c.id);
    expect(p.viewingSplit).toBe(false);
    expect(p.split).toEqual(expect.objectContaining({ leftId: a.id, rightId: b.id }));
  });

  it("views the split and focuses the primary when the left member is selected", () => {
    const { state, a } = seedSplit();
    const parked = setActiveTab(state, PROJECT, a.id);
    const next = setActiveTab(parked, PROJECT, a.id);
    const p = projectTabs(next, PROJECT);
    expect(p.viewingSplit).toBe(true);
    expect(p.split?.focusedPane).toBe("primary");
  });

  it("views the split and focuses the secondary when the right member is selected", () => {
    const { state, b } = seedSplit();
    const parked = setFocusedPane(state, PROJECT, "primary");
    const next = setActiveTab(parked, PROJECT, b.id);
    const p = projectTabs(next, PROJECT);
    expect(p.viewingSplit).toBe(true);
    expect(p.split?.focusedPane).toBe("secondary");
  });

  it("parks the split when an ide solo tab is selected", () => {
    const { state } = seedSplit();
    const withIde = addTab(state, PROJECT, createTab("ide", SETTINGS));
    const ide = projectTabs(withIde, PROJECT).tabs.find((t) => t.kind === "ide");
    if (!ide) throw new Error("ide tab missing");
    const next = setActiveTab(withIde, PROJECT, ide.id);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(ide.id);
    expect(p.viewingSplit).toBe(false);
    expect(p.split).not.toBeNull();
  });
});

describe("viewSplit", () => {
  it("switches to the split view", () => {
    const { state, c } = seedSplit();
    const parked = setActiveTab(state, PROJECT, c.id);
    expect(projectTabs(parked, PROJECT).viewingSplit).toBe(false);
    const next = viewSplit(parked, PROJECT);
    expect(projectTabs(next, PROJECT).viewingSplit).toBe(true);
  });

  it("is a no-op when there is no split", () => {
    const state = seed(["terminal"]);
    expect(viewSplit(state, PROJECT)).toBe(state);
  });
});

describe("setFocusedPane", () => {
  it("focuses a pane and views the split", () => {
    const { state } = seedSplit();
    const parked = setActiveTab(state, PROJECT, projectTabs(state, PROJECT).split?.leftId ?? "");
    const next = setFocusedPane(parked, PROJECT, "secondary");
    const p = projectTabs(next, PROJECT);
    expect(p.viewingSplit).toBe(true);
    expect(p.split?.focusedPane).toBe("secondary");
  });

  it("is a no-op when there is no split", () => {
    const state = seed(["terminal"]);
    expect(setFocusedPane(state, PROJECT, "secondary")).toBe(state);
  });
});

describe("renameSplit", () => {
  it("sets the split title", () => {
    const { state } = seedSplit();
    const next = renameSplit(state, PROJECT, "Frontend");
    expect(projectTabs(next, PROJECT).split?.title).toBe("Frontend");
  });

  it("is a no-op when there is no split", () => {
    const state = seed(["terminal"]);
    expect(renameSplit(state, PROJECT, "Frontend")).toBe(state);
  });
});

describe("recolorSplit", () => {
  it("sets the split color", () => {
    const { state } = seedSplit();
    const next = recolorSplit(state, PROJECT, "#ff0000");
    expect(projectTabs(next, PROJECT).split?.color).toBe("#ff0000");
  });

  it("is a no-op when there is no split", () => {
    const state = seed(["terminal"]);
    expect(recolorSplit(state, PROJECT, "#ff0000")).toBe(state);
  });
});

describe("swapPanes", () => {
  it("swaps left/right and flips focusedPane so the same tab stays focused", () => {
    const { state, a, b } = seedSplit();
    expect(projectTabs(state, PROJECT).split).toEqual(
      expect.objectContaining({ leftId: a.id, rightId: b.id, focusedPane: "secondary" }),
    );
    const next = swapPanes(state, PROJECT);
    expect(projectTabs(next, PROJECT).split).toEqual(
      expect.objectContaining({ leftId: b.id, rightId: a.id, focusedPane: "primary" }),
    );
  });

  it("is a no-op when there is no split", () => {
    const state = seed(["terminal", "terminal"]);
    expect(swapPanes(state, PROJECT)).toBe(state);
  });
});

describe("openTabToSide", () => {
  it("opens a fresh split with the active tab as left and the target as right", () => {
    const { state, a, b } = seedSplit();
    const p = projectTabs(state, PROJECT);
    expect(p.split).toEqual(expect.objectContaining({ leftId: a.id, rightId: b.id }));
    expect(p.split?.focusedPane).toBe("secondary");
    expect(p.split?.title).toBe("Split");
    expect(p.split?.color).toBeNull();
    expect(p.viewingSplit).toBe(true);
  });

  it("keeps the existing left and replaces the right with a third tab", () => {
    const { state, a, c } = seedSplit();
    const next = openTabToSide(state, PROJECT, c.id);
    const p = projectTabs(next, PROJECT);
    expect(p.split).toEqual(expect.objectContaining({ leftId: a.id, rightId: c.id }));
    expect(p.split?.focusedPane).toBe("secondary");
    expect(p.viewingSplit).toBe(true);
  });

  it("prefers the current active tab as left over a parked split's left", () => {
    const base = seed(["terminal", "terminal", "terminal", "terminal"]);
    const [a, b, c, d] = projectTabs(base, PROJECT).tabs;
    const withA = setActiveTab(base, PROJECT, a.id);
    const split = openTabToSide(withA, PROJECT, b.id);
    const parked = setActiveTab(split, PROJECT, c.id);
    const next = openTabToSide(parked, PROJECT, d.id);
    const p = projectTabs(next, PROJECT);
    expect(p.split).toEqual(expect.objectContaining({ leftId: c.id, rightId: d.id }));
    expect(p.viewingSplit).toBe(true);
  });

  it("just views and focuses the secondary when the target is already the right member", () => {
    const { state, a, b } = seedSplit();
    const parked = setActiveTab(state, PROJECT, a.id);
    const refocused = openTabToSide(parked, PROJECT, b.id);
    const p = projectTabs(refocused, PROJECT);
    expect(p.viewingSplit).toBe(true);
    expect(p.split?.focusedPane).toBe("secondary");
    expect(p.split).toEqual(expect.objectContaining({ leftId: a.id, rightId: b.id }));
  });

  it("is a no-op for an ide target", () => {
    const base = seed(["terminal", "terminal"]);
    const withIde = addTab(base, PROJECT, createTab("ide", SETTINGS));
    const ide = projectTabs(withIde, PROJECT).tabs.find((t) => t.kind === "ide");
    if (!ide) throw new Error("ide tab missing");
    const next = openTabToSide(withIde, PROJECT, ide.id);
    expect(next).toBe(withIde);
  });

  it("cannot split a single-tab project, parking the target as solo", () => {
    const state = seed(["terminal"]);
    const only = projectTabs(state, PROJECT).tabs[0].id;
    const next = openTabToSide(state, PROJECT, only);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(only);
    expect(p.split).toBeNull();
    expect(p.viewingSplit).toBe(false);
  });

  it("parks the target when there is no other tab to pair with", () => {
    const b = mkTab("b", "terminal");
    const state: TabsState = { [PROJECT]: pt([b], null) };
    const next = openTabToSide(state, PROJECT, b.id);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(b.id);
    expect(p.split).toBeNull();
    expect(p.viewingSplit).toBe(false);
  });

  it("picks another non-ide tab as left when the active tab is an ide", () => {
    const base = seed(["terminal", "terminal"]);
    const [t0, t1] = projectTabs(base, PROJECT).tabs;
    const withIde = addTab(base, PROJECT, createTab("ide", SETTINGS));
    const next = openTabToSide(withIde, PROJECT, t1.id);
    const p = projectTabs(next, PROJECT);
    expect(p.split).toEqual(expect.objectContaining({ leftId: t0.id, rightId: t1.id }));
    expect(p.split?.focusedPane).toBe("secondary");
    expect(p.viewingSplit).toBe(true);
  });
});

describe("unsplit", () => {
  it("dissolves the split, keeps both members as solo tabs, and shows the left one", () => {
    const { state, a, b } = seedSplit();
    const next = unsplit(state, PROJECT);
    const p = projectTabs(next, PROJECT);
    expect(p.split).toBeNull();
    expect(p.viewingSplit).toBe(false);
    expect(p.activeTabId).toBe(a.id);
    expect(p.tabs.some((t) => t.id === a.id)).toBe(true);
    expect(p.tabs.some((t) => t.id === b.id)).toBe(true);
  });

  it("keeps the current active tab when there is no split", () => {
    const state = seed(["terminal", "claude"]);
    const [, t1] = projectTabs(state, PROJECT).tabs;
    const next = unsplit(state, PROJECT);
    expect(projectTabs(next, PROJECT).activeTabId).toBe(t1.id);
  });
});

describe("setSplitRatio", () => {
  it("clamps below the minimum", () => {
    const { state } = seedSplit();
    const next = setSplitRatio(state, PROJECT, 0.05);
    expect(projectTabs(next, PROJECT).split?.ratio).toBe(MIN_SPLIT_RATIO);
  });

  it("clamps above the maximum", () => {
    const { state } = seedSplit();
    const next = setSplitRatio(state, PROJECT, 0.95);
    expect(projectTabs(next, PROJECT).split?.ratio).toBe(MAX_SPLIT_RATIO);
  });

  it("keeps an in-range ratio unchanged", () => {
    const { state } = seedSplit();
    const next = setSplitRatio(state, PROJECT, 0.63);
    expect(projectTabs(next, PROJECT).split?.ratio).toBe(0.63);
  });

  it("is a no-op for NaN", () => {
    const { state } = seedSplit();
    expect(setSplitRatio(state, PROJECT, Number.NaN)).toBe(state);
  });

  it("is a no-op for Infinity", () => {
    const { state } = seedSplit();
    expect(setSplitRatio(state, PROJECT, Number.POSITIVE_INFINITY)).toBe(state);
  });

  it("is a no-op when there is no split", () => {
    const state = seed(["terminal"]);
    expect(setSplitRatio(state, PROJECT, 0.63)).toBe(state);
  });
});

describe("renameTab", () => {
  it("renames the matching tab and leaves others untouched", () => {
    const state = seed(["terminal", "claude"]);
    const [t0, t1] = projectTabs(state, PROJECT).tabs;
    const next = renameTab(state, PROJECT, t0.id, "My Terminal");
    const p = projectTabs(next, PROJECT);
    expect(p.tabs[0].title).toBe("My Terminal");
    expect(p.tabs[1].title).toBe(t1.title);
  });
});

describe("recolorTab", () => {
  it("recolors the matching tab and leaves others untouched", () => {
    const state = seed(["terminal", "claude"]);
    const [t0, t1] = projectTabs(state, PROJECT).tabs;
    const next = recolorTab(state, PROJECT, t0.id, "#ff0000");
    const p = projectTabs(next, PROJECT);
    expect(p.tabs[0].color).toBe("#ff0000");
    expect(p.tabs[1].color).toBe(t1.color);
  });
});

describe("reorderTabs", () => {
  it("moves a tab before another", () => {
    const state = seed(["terminal", "claude", "opencode"]);
    const [t0, t1, t2] = projectTabs(state, PROJECT).tabs;
    const next = reorderTabs(state, PROJECT, t2.id, t0.id);
    expect(projectTabs(next, PROJECT).tabs.map((t) => t.id)).toEqual([t2.id, t0.id, t1.id]);
  });

  it("moves a tab to the end when insertBeforeId is null", () => {
    const state = seed(["terminal", "claude", "opencode"]);
    const [t0, t1, t2] = projectTabs(state, PROJECT).tabs;
    const next = reorderTabs(state, PROJECT, t0.id, null);
    expect(projectTabs(next, PROJECT).tabs.map((t) => t.id)).toEqual([t1.id, t2.id, t0.id]);
  });

  it("is a no-op when the dragged tab is unknown", () => {
    const state = seed(["terminal", "claude"]);
    const [, t1] = projectTabs(state, PROJECT).tabs;
    const next = reorderTabs(state, PROJECT, "missing", t1.id);
    expect(next).toBe(state);
  });

  it("is a no-op when the insertion target is unknown", () => {
    const state = seed(["terminal", "claude"]);
    const [t0] = projectTabs(state, PROJECT).tabs;
    const next = reorderTabs(state, PROJECT, t0.id, "missing");
    expect(next).toBe(state);
  });
});

describe("activePaneTabs", () => {
  it("returns the solo active tab and a null secondary when not viewing a split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const { primary, secondary } = activePaneTabs(pt([a, b], a.id));
    expect(primary).toBe(a);
    expect(secondary).toBeNull();
  });

  it("ignores the split members while parked (viewingSplit false)", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const c = mkTab("c", "terminal");
    const { primary, secondary } = activePaneTabs(pt([a, b, c], c.id, mkSplit(a.id, b.id), false));
    expect(primary).toBe(c);
    expect(secondary).toBeNull();
  });

  it("returns both panes for two distinct non-ide members while viewing the split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "claude");
    const { primary, secondary } = activePaneTabs(pt([a, b], a.id, mkSplit(a.id, b.id), true));
    expect(primary).toBe(a);
    expect(secondary).toBe(b);
  });

  it("returns a null primary when the solo active tab points to a missing tab", () => {
    const a = mkTab("a", "terminal");
    const { primary, secondary } = activePaneTabs(pt([a], "ghost"));
    expect(primary).toBeNull();
    expect(secondary).toBeNull();
  });

  it("returns a null primary when the left member points to a missing tab", () => {
    const b = mkTab("b", "terminal");
    const { primary, secondary } = activePaneTabs(pt([b], null, mkSplit("ghost", b.id), true));
    expect(primary).toBeNull();
    expect(secondary).toBeNull();
  });

  it("returns a null secondary when the right member points to a missing tab", () => {
    const a = mkTab("a", "terminal");
    const p = activePaneTabs(pt([a], a.id, mkSplit(a.id, "ghost"), true));
    expect(p.primary).toBe(a);
    expect(p.secondary).toBeNull();
  });

  it("hides an ide right member", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "ide");
    expect(activePaneTabs(pt([a, b], a.id, mkSplit(a.id, b.id), true)).secondary).toBeNull();
  });

  it("hides the secondary when the left member is an ide", () => {
    const a = mkTab("a", "ide");
    const b = mkTab("b", "terminal");
    expect(activePaneTabs(pt([a, b], a.id, mkSplit(a.id, b.id), true)).secondary).toBeNull();
  });

  it("hides the secondary when both members are the same tab", () => {
    const a = mkTab("a", "terminal");
    expect(activePaneTabs(pt([a], a.id, mkSplit(a.id, a.id), true)).secondary).toBeNull();
  });
});

describe("focusedTab", () => {
  it("returns the secondary when the secondary pane is focused while viewing the split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    expect(focusedTab(pt([a, b], a.id, mkSplit(a.id, b.id, "secondary"), true))).toBe(b);
  });

  it("returns the primary when the primary pane is focused while viewing the split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    expect(focusedTab(pt([a, b], a.id, mkSplit(a.id, b.id, "primary"), true))).toBe(a);
  });

  it("returns the solo active tab when parked, ignoring the split's focused pane", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const c = mkTab("c", "terminal");
    expect(focusedTab(pt([a, b, c], c.id, mkSplit(a.id, b.id, "secondary"), false))).toBe(c);
  });
});

describe("closeTab with split state", () => {
  it("dissolves the split when the right member is closed, keeping the left as solo", () => {
    const { state, a, b } = seedSplit();
    const next = closeTab(state, PROJECT, b.id);
    const p = projectTabs(next, PROJECT);
    expect(p.split).toBeNull();
    expect(p.viewingSplit).toBe(false);
    expect(p.activeTabId).toBe(a.id);
    expect(p.tabs.some((t) => t.id === b.id)).toBe(false);
  });

  it("dissolves the split when the left member is closed, keeping the right as solo", () => {
    const { state, a, b } = seedSplit();
    const next = closeTab(state, PROJECT, a.id);
    const p = projectTabs(next, PROJECT);
    expect(p.split).toBeNull();
    expect(p.viewingSplit).toBe(false);
    expect(p.activeTabId).toBe(b.id);
    expect(p.tabs.some((t) => t.id === a.id)).toBe(false);
  });

  it("returns to the split when the last non-member solo tab is closed", () => {
    const { state, a, b, c } = seedSplit();
    const parked = setActiveTab(state, PROJECT, c.id);
    const next = closeTab(parked, PROJECT, c.id);
    const p = projectTabs(next, PROJECT);
    expect(p.split).toEqual(expect.objectContaining({ leftId: a.id, rightId: b.id }));
    expect(p.tabs.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(p.viewingSplit).toBe(true);
    expect(p.activeTabId).toBeNull();
  });

  it("picks a non-member solo neighbor when other solo tabs remain", () => {
    const base = seed(["terminal", "terminal", "terminal", "terminal"]);
    const [a, b, c, d] = projectTabs(base, PROJECT).tabs;
    const withA = setActiveTab(base, PROJECT, a.id);
    const split = openTabToSide(withA, PROJECT, b.id);
    const viewD = setActiveTab(split, PROJECT, d.id);
    const next = closeTab(viewD, PROJECT, d.id);
    const p = projectTabs(next, PROJECT);
    expect(p.viewingSplit).toBe(false);
    expect(p.activeTabId).toBe(c.id);
    expect(p.split).toEqual(expect.objectContaining({ leftId: a.id, rightId: b.id }));
  });
});

describe("split state carry-through", () => {
  it("keeps the split across rename, recolor, and reorder", () => {
    const { state, a, b, c } = seedSplit();
    const ratioed = setSplitRatio(state, PROJECT, 0.63);

    const renamed = renameTab(ratioed, PROJECT, a.id, "Renamed");
    expect(projectTabs(renamed, PROJECT).split).toEqual(
      expect.objectContaining({ leftId: a.id, rightId: b.id, ratio: 0.63 }),
    );

    const recolored = recolorTab(ratioed, PROJECT, a.id, "#ff0000");
    expect(projectTabs(recolored, PROJECT).split?.ratio).toBe(0.63);

    const reordered = reorderTabs(ratioed, PROJECT, c.id, a.id);
    expect(projectTabs(reordered, PROJECT).split?.ratio).toBe(0.63);
  });
});
