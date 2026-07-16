import { describe, expect, it } from "vitest";
import {
  activePaneTabs,
  addTab,
  addToSplit,
  closeTab,
  createCustomTab,
  createTab,
  defaultTitle,
  findTabOwner,
  focusedTab,
  MAX_SPLIT_MEMBERS,
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
  setSplitRowRatio,
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

function mkSplit(memberIds: string[], focusedPane: PaneId = "primary", id = "split-1"): Split {
  return { id, memberIds, focusedPane, ratio: 0.5, rowRatio: 0.5, title: "Split", color: null };
}

function pt(
  tabs: Tab[],
  activeTabId: string | null,
  splits: Split[] = [],
  viewingSplitId: string | null = null,
): ProjectTabs {
  return { tabs, activeTabId, splits, viewingSplitId };
}

function seedSplit(): { state: TabsState; a: Tab; b: Tab; c: Tab; splitId: string } {
  const base = seed(["terminal", "terminal", "terminal"]);
  const [a, b, c] = projectTabs(base, PROJECT).tabs;
  const withA = setActiveTab(base, PROJECT, a.id);
  const state = openTabToSide(withA, PROJECT, b.id);
  const splitId = projectTabs(state, PROJECT).splits[0].id;
  return { state, a, b, c, splitId };
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
    expect(p.viewingSplitId).toBeNull();
  });

  it("snapshots the launch command onto the tab", () => {
    const state = seed(["claude"]);
    expect(projectTabs(state, PROJECT).tabs[0].startupCommand).toBe("claude --resume");
  });

  it("parks an existing split, leaving it intact", () => {
    const { state, a, b, splitId } = seedSplit();
    const tab = createTab("claude", SETTINGS);
    const next = addTab(state, PROJECT, tab);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(tab.id);
    expect(p.viewingSplitId).toBeNull();
    expect(p.splits.find((s) => s.id === splitId)).toEqual(
      expect.objectContaining({ memberIds: [a.id, b.id] }),
    );
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
      splits: [],
      viewingSplitId: null,
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
  it("switches the active solo tab and clears viewingSplitId", () => {
    const state = seed(["terminal", "claude"]);
    const [t0] = projectTabs(state, PROJECT).tabs;
    const next = setActiveTab(state, PROJECT, t0.id);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(t0.id);
    expect(p.viewingSplitId).toBeNull();
  });

  it("is a no-op for an unknown tab id", () => {
    const state = seed(["terminal"]);
    const next = setActiveTab(state, PROJECT, "missing");
    expect(next).toBe(state);
  });

  it("parks the split when a solo tab is selected, preserving the split", () => {
    const { state, a, b, c, splitId } = seedSplit();
    const next = setActiveTab(state, PROJECT, c.id);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(c.id);
    expect(p.viewingSplitId).toBeNull();
    expect(p.splits.find((s) => s.id === splitId)).toEqual(
      expect.objectContaining({ memberIds: [a.id, b.id] }),
    );
  });

  it("views the split and focuses the primary when the left member is selected", () => {
    const { state, a, splitId } = seedSplit();
    const parked = setActiveTab(state, PROJECT, a.id);
    const next = setActiveTab(parked, PROJECT, a.id);
    const p = projectTabs(next, PROJECT);
    expect(p.viewingSplitId).toBe(splitId);
    expect(p.splits[0].focusedPane).toBe("primary");
  });

  it("views the split and focuses the secondary when the right member is selected", () => {
    const { state, b, splitId } = seedSplit();
    const parked = setFocusedPane(state, PROJECT, splitId, "primary");
    const next = setActiveTab(parked, PROJECT, b.id);
    const p = projectTabs(next, PROJECT);
    expect(p.viewingSplitId).toBe(splitId);
    expect(p.splits[0].focusedPane).toBe("secondary");
  });

  it("parks the split when an ide solo tab is selected", () => {
    const { state } = seedSplit();
    const withIde = addTab(state, PROJECT, createTab("ide", SETTINGS));
    const ide = projectTabs(withIde, PROJECT).tabs.find((t) => t.kind === "ide");
    if (!ide) throw new Error("ide tab missing");
    const next = setActiveTab(withIde, PROJECT, ide.id);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(ide.id);
    expect(p.viewingSplitId).toBeNull();
    expect(p.splits).toHaveLength(1);
  });
});

describe("viewSplit", () => {
  it("switches to the split view", () => {
    const { state, c, splitId } = seedSplit();
    const parked = setActiveTab(state, PROJECT, c.id);
    expect(projectTabs(parked, PROJECT).viewingSplitId).toBeNull();
    const next = viewSplit(parked, PROJECT, splitId);
    expect(projectTabs(next, PROJECT).viewingSplitId).toBe(splitId);
  });

  it("is a no-op for an unknown split id", () => {
    const state = seed(["terminal"]);
    expect(viewSplit(state, PROJECT, "missing")).toBe(state);
  });
});

describe("setFocusedPane", () => {
  it("focuses a pane and views the split", () => {
    const { state, splitId } = seedSplit();
    const parked = setActiveTab(state, PROJECT, projectTabs(state, PROJECT).splits[0].memberIds[0]);
    const next = setFocusedPane(parked, PROJECT, splitId, "secondary");
    const p = projectTabs(next, PROJECT);
    expect(p.viewingSplitId).toBe(splitId);
    expect(p.splits[0].focusedPane).toBe("secondary");
  });

  it("is a no-op for an unknown split id", () => {
    const state = seed(["terminal"]);
    expect(setFocusedPane(state, PROJECT, "missing", "secondary")).toBe(state);
  });
});

describe("renameSplit", () => {
  it("sets the split title", () => {
    const { state, splitId } = seedSplit();
    const next = renameSplit(state, PROJECT, splitId, "Frontend");
    expect(projectTabs(next, PROJECT).splits[0].title).toBe("Frontend");
  });

  it("is a no-op for an unknown split id", () => {
    const state = seed(["terminal"]);
    expect(renameSplit(state, PROJECT, "missing", "Frontend")).toBe(state);
  });
});

describe("recolorSplit", () => {
  it("sets the split color", () => {
    const { state, splitId } = seedSplit();
    const next = recolorSplit(state, PROJECT, splitId, "#ff0000");
    expect(projectTabs(next, PROJECT).splits[0].color).toBe("#ff0000");
  });

  it("is a no-op for an unknown split id", () => {
    const state = seed(["terminal"]);
    expect(recolorSplit(state, PROJECT, "missing", "#ff0000")).toBe(state);
  });
});

describe("swapPanes", () => {
  it("swaps primary/secondary and flips focusedPane so the same tab stays focused", () => {
    const { state, a, b, splitId } = seedSplit();
    expect(projectTabs(state, PROJECT).splits[0]).toEqual(
      expect.objectContaining({ memberIds: [a.id, b.id], focusedPane: "secondary" }),
    );
    const next = swapPanes(state, PROJECT, splitId, "primary", "secondary");
    expect(projectTabs(next, PROJECT).splits[0]).toEqual(
      expect.objectContaining({ memberIds: [b.id, a.id], focusedPane: "primary" }),
    );
  });

  it("swaps an arbitrary pair (e.g. primary and tertiary) in a 3-member split", () => {
    const { state, a, b, c, splitId } = seedSplit();
    const withThree = addToSplit(state, PROJECT, splitId, c.id);
    const next = swapPanes(withThree, PROJECT, splitId, "primary", "tertiary");
    const p = projectTabs(next, PROJECT);
    expect(p.splits[0].memberIds).toEqual([c.id, b.id, a.id]);
  });

  it("flips focusedPane when the focused pane is one of the swapped pair", () => {
    const { state, c, splitId } = seedSplit();
    const withThree = addToSplit(state, PROJECT, splitId, c.id);
    expect(projectTabs(withThree, PROJECT).splits[0].focusedPane).toBe("tertiary");
    const next = swapPanes(withThree, PROJECT, splitId, "primary", "tertiary");
    expect(projectTabs(next, PROJECT).splits[0].focusedPane).toBe("primary");
  });

  it("leaves focusedPane untouched when neither swapped pane is focused", () => {
    const { state, c, splitId } = seedSplit();
    const withThree = addToSplit(state, PROJECT, splitId, c.id);
    const focusedOnSecondary = setFocusedPane(withThree, PROJECT, splitId, "secondary");
    const next = swapPanes(focusedOnSecondary, PROJECT, splitId, "primary", "tertiary");
    expect(projectTabs(next, PROJECT).splits[0].focusedPane).toBe("secondary");
  });

  it("is a no-op when a pane is out of range for the current member count", () => {
    const { state, splitId } = seedSplit();
    expect(swapPanes(state, PROJECT, splitId, "primary", "tertiary")).toBe(state);
  });

  it("is a no-op for an unknown split id", () => {
    const state = seed(["terminal", "terminal"]);
    expect(swapPanes(state, PROJECT, "missing", "primary", "secondary")).toBe(state);
  });
});

describe("openTabToSide", () => {
  it("opens a fresh split with the active tab as left and the target as right", () => {
    const { state, a, b } = seedSplit();
    const p = projectTabs(state, PROJECT);
    expect(p.splits[0]).toEqual(expect.objectContaining({ memberIds: [a.id, b.id] }));
    expect(p.splits[0].focusedPane).toBe("secondary");
    expect(p.splits[0].title).toBe("Split");
    expect(p.splits[0].color).toBeNull();
    expect(p.viewingSplitId).toBe(p.splits[0].id);
  });

  it("starts an independent second split rather than touching an existing one", () => {
    const { state, a, b, c, splitId } = seedSplit();
    const next = openTabToSide(state, PROJECT, c.id);
    const p = projectTabs(next, PROJECT);
    // The original split is untouched — growing it is addToSplit's job, not openTabToSide's.
    expect(p.splits.find((s) => s.id === splitId)).toEqual(
      expect.objectContaining({ memberIds: [a.id, b.id] }),
    );
    // With no solo tab active (a split is being viewed) and no unclaimed partner
    // for c, it just parks c as a solo tab instead of guessing.
    expect(p.activeTabId).toBe(c.id);
    expect(p.viewingSplitId).toBeNull();
    expect(p.splits).toHaveLength(1);
  });

  it("creates a second independent split when the active solo tab pairs with a free tab", () => {
    const base = seed(["terminal", "terminal", "terminal", "terminal"]);
    const [a, b, c, d] = projectTabs(base, PROJECT).tabs;
    const withA = setActiveTab(base, PROJECT, a.id);
    const firstSplit = openTabToSide(withA, PROJECT, b.id);
    const firstSplitId = projectTabs(firstSplit, PROJECT).splits[0].id;
    const parked = setActiveTab(firstSplit, PROJECT, c.id);
    const next = openTabToSide(parked, PROJECT, d.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits).toHaveLength(2);
    expect(p.splits.find((s) => s.id === firstSplitId)).toEqual(
      expect.objectContaining({ memberIds: [a.id, b.id] }),
    );
    const secondSplit = p.splits.find((s) => s.id !== firstSplitId);
    expect(secondSplit).toEqual(expect.objectContaining({ memberIds: [c.id, d.id] }));
    expect(p.viewingSplitId).toBe(secondSplit?.id);
  });

  it("just views and focuses the secondary when the target is already the right member", () => {
    const { state, a, b, splitId } = seedSplit();
    const parked = setActiveTab(state, PROJECT, a.id);
    const refocused = openTabToSide(parked, PROJECT, b.id);
    const p = projectTabs(refocused, PROJECT);
    expect(p.viewingSplitId).toBe(splitId);
    expect(p.splits[0].focusedPane).toBe("secondary");
    expect(p.splits[0]).toEqual(expect.objectContaining({ memberIds: [a.id, b.id] }));
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
    expect(p.splits).toHaveLength(0);
    expect(p.viewingSplitId).toBeNull();
  });

  it("parks the target when there is no other tab to pair with", () => {
    const b = mkTab("b", "terminal");
    const state: TabsState = { [PROJECT]: pt([b], null) };
    const next = openTabToSide(state, PROJECT, b.id);
    const p = projectTabs(next, PROJECT);
    expect(p.activeTabId).toBe(b.id);
    expect(p.splits).toHaveLength(0);
    expect(p.viewingSplitId).toBeNull();
  });

  it("picks another non-ide tab as left when the active tab is an ide", () => {
    const base = seed(["terminal", "terminal"]);
    const [t0, t1] = projectTabs(base, PROJECT).tabs;
    const withIde = addTab(base, PROJECT, createTab("ide", SETTINGS));
    const next = openTabToSide(withIde, PROJECT, t1.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits[0]).toEqual(expect.objectContaining({ memberIds: [t0.id, t1.id] }));
    expect(p.splits[0].focusedPane).toBe("secondary");
    expect(p.viewingSplitId).toBe(p.splits[0].id);
  });
});

describe("unsplit", () => {
  it("dissolves the split, keeps both members as solo tabs, and shows the left one", () => {
    const { state, a, b, splitId } = seedSplit();
    const next = unsplit(state, PROJECT, splitId);
    const p = projectTabs(next, PROJECT);
    expect(p.splits).toHaveLength(0);
    expect(p.viewingSplitId).toBeNull();
    expect(p.activeTabId).toBe(a.id);
    expect(p.tabs.some((t) => t.id === a.id)).toBe(true);
    expect(p.tabs.some((t) => t.id === b.id)).toBe(true);
  });

  it("is a no-op for an unknown split id", () => {
    const state = seed(["terminal", "claude"]);
    const [, t1] = projectTabs(state, PROJECT).tabs;
    const withActive = setActiveTab(state, PROJECT, t1.id);
    expect(unsplit(withActive, PROJECT, "missing")).toBe(withActive);
  });
});

describe("setSplitRatio", () => {
  it("clamps below the minimum", () => {
    const { state, splitId } = seedSplit();
    const next = setSplitRatio(state, PROJECT, splitId, 0.05);
    expect(projectTabs(next, PROJECT).splits[0].ratio).toBe(MIN_SPLIT_RATIO);
  });

  it("clamps above the maximum", () => {
    const { state, splitId } = seedSplit();
    const next = setSplitRatio(state, PROJECT, splitId, 0.95);
    expect(projectTabs(next, PROJECT).splits[0].ratio).toBe(MAX_SPLIT_RATIO);
  });

  it("keeps an in-range ratio unchanged", () => {
    const { state, splitId } = seedSplit();
    const next = setSplitRatio(state, PROJECT, splitId, 0.63);
    expect(projectTabs(next, PROJECT).splits[0].ratio).toBe(0.63);
  });

  it("is a no-op for NaN", () => {
    const { state, splitId } = seedSplit();
    expect(setSplitRatio(state, PROJECT, splitId, Number.NaN)).toBe(state);
  });

  it("is a no-op for Infinity", () => {
    const { state, splitId } = seedSplit();
    expect(setSplitRatio(state, PROJECT, splitId, Number.POSITIVE_INFINITY)).toBe(state);
  });

  it("is a no-op for an unknown split id", () => {
    const state = seed(["terminal"]);
    expect(setSplitRatio(state, PROJECT, "missing", 0.63)).toBe(state);
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

  it("moves a split chip's whole member block, keeping members adjacent", () => {
    const base = seed(["terminal", "terminal", "terminal"]);
    const [a, b, c] = projectTabs(base, PROJECT).tabs;
    const withA = setActiveTab(base, PROJECT, a.id);
    const split = openTabToSide(withA, PROJECT, c.id);
    const splitId = projectTabs(split, PROJECT).splits[0].id;
    const next = reorderTabs(split, PROJECT, splitId, b.id);
    expect(projectTabs(next, PROJECT).tabs.map((t) => t.id)).toEqual([a.id, c.id, b.id]);
  });

  it("resolves a split drop target to the split's anchor (first member)", () => {
    const base = seed(["terminal", "terminal", "terminal"]);
    const [a, b, c] = projectTabs(base, PROJECT).tabs;
    const withB = setActiveTab(base, PROJECT, b.id);
    const split = openTabToSide(withB, PROJECT, c.id);
    const splitId = projectTabs(split, PROJECT).splits[0].id;
    const next = reorderTabs(split, PROJECT, a.id, splitId);
    expect(projectTabs(next, PROJECT).tabs.map((t) => t.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe("activePaneTabs", () => {
  it("returns the solo active tab and null others when not viewing a split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const { primary, secondary, tertiary, quaternary } = activePaneTabs(pt([a, b], a.id));
    expect(primary).toBe(a);
    expect(secondary).toBeNull();
    expect(tertiary).toBeNull();
    expect(quaternary).toBeNull();
  });

  it("ignores the split members while parked (no split being viewed)", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const c = mkTab("c", "terminal");
    const split = mkSplit([a.id, b.id]);
    const { primary, secondary } = activePaneTabs(pt([a, b, c], c.id, [split], null));
    expect(primary).toBe(c);
    expect(secondary).toBeNull();
  });

  it("returns both panes for two members while viewing the split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "claude");
    const split = mkSplit([a.id, b.id]);
    const { primary, secondary, tertiary } = activePaneTabs(pt([a, b], a.id, [split], split.id));
    expect(primary).toBe(a);
    expect(secondary).toBe(b);
    expect(tertiary).toBeNull();
  });

  it("returns all four panes for a 4-member split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const c = mkTab("c", "terminal");
    const d = mkTab("d", "terminal");
    const split = mkSplit([a.id, b.id, c.id, d.id]);
    const panes = activePaneTabs(pt([a, b, c, d], a.id, [split], split.id));
    expect(panes).toEqual({ primary: a, secondary: b, tertiary: c, quaternary: d });
  });

  it("returns a null primary when the solo active tab points to a missing tab", () => {
    const a = mkTab("a", "terminal");
    const { primary, secondary } = activePaneTabs(pt([a], "ghost"));
    expect(primary).toBeNull();
    expect(secondary).toBeNull();
  });

  it("returns a null primary when the first member points to a missing tab", () => {
    const b = mkTab("b", "terminal");
    const split = mkSplit(["ghost", b.id]);
    const { primary, secondary } = activePaneTabs(pt([b], null, [split], split.id));
    expect(primary).toBeNull();
    expect(secondary).toBe(b);
  });

  it("only reflects the currently viewed split when several exist", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const c = mkTab("c", "terminal");
    const d = mkTab("d", "terminal");
    const split1 = mkSplit([a.id, b.id], "primary", "split-1");
    const split2 = mkSplit([c.id, d.id], "primary", "split-2");
    const { primary, secondary } = activePaneTabs(
      pt([a, b, c, d], null, [split1, split2], split2.id),
    );
    expect(primary).toBe(c);
    expect(secondary).toBe(d);
  });
});

describe("focusedTab", () => {
  it("returns the secondary when the secondary pane is focused while viewing the split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const split = mkSplit([a.id, b.id], "secondary");
    expect(focusedTab(pt([a, b], a.id, [split], split.id))).toBe(b);
  });

  it("returns the primary when the primary pane is focused while viewing the split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const split = mkSplit([a.id, b.id], "primary");
    expect(focusedTab(pt([a, b], a.id, [split], split.id))).toBe(a);
  });

  it("returns the solo active tab when parked, ignoring the split's focused pane", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const c = mkTab("c", "terminal");
    const split = mkSplit([a.id, b.id], "secondary");
    expect(focusedTab(pt([a, b, c], c.id, [split], null))).toBe(c);
  });

  it("returns the tertiary tab when it's focused in a 3-member split", () => {
    const a = mkTab("a", "terminal");
    const b = mkTab("b", "terminal");
    const c = mkTab("c", "terminal");
    const split = mkSplit([a.id, b.id, c.id], "tertiary");
    expect(focusedTab(pt([a, b, c], a.id, [split], split.id))).toBe(c);
  });
});

describe("closeTab with split state", () => {
  it("dissolves the split when the right member is closed, keeping the left as solo", () => {
    const { state, a, b } = seedSplit();
    const next = closeTab(state, PROJECT, b.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits).toHaveLength(0);
    expect(p.viewingSplitId).toBeNull();
    expect(p.activeTabId).toBe(a.id);
    expect(p.tabs.some((t) => t.id === b.id)).toBe(false);
  });

  it("dissolves the split when the left member is closed, keeping the right as solo", () => {
    const { state, a, b } = seedSplit();
    const next = closeTab(state, PROJECT, a.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits).toHaveLength(0);
    expect(p.viewingSplitId).toBeNull();
    expect(p.activeTabId).toBe(b.id);
    expect(p.tabs.some((t) => t.id === a.id)).toBe(false);
  });

  it("returns to the split when the last non-member solo tab is closed", () => {
    const { state, a, b, c, splitId } = seedSplit();
    const parked = setActiveTab(state, PROJECT, c.id);
    const next = closeTab(parked, PROJECT, c.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits[0]).toEqual(expect.objectContaining({ memberIds: [a.id, b.id] }));
    expect(p.tabs.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(p.viewingSplitId).toBe(splitId);
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
    expect(p.viewingSplitId).toBeNull();
    expect(p.activeTabId).toBe(c.id);
    expect(p.splits[0]).toEqual(expect.objectContaining({ memberIds: [a.id, b.id] }));
  });
});

describe("addToSplit", () => {
  it("appends a tab to the split and focuses it", () => {
    const { state, c, splitId } = seedSplit();
    const next = addToSplit(state, PROJECT, splitId, c.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits[0].memberIds).toHaveLength(3);
    expect(p.splits[0].memberIds[2]).toBe(c.id);
    expect(p.splits[0].focusedPane).toBe("tertiary");
    expect(p.viewingSplitId).toBe(splitId);
  });

  it("grows a 3-member split to 4 and focuses the quaternary pane", () => {
    const { state, c, splitId } = seedSplit();
    const withThree = addToSplit(state, PROJECT, splitId, c.id);
    const d = createTab("terminal", SETTINGS);
    const withFour = addTab(withThree, PROJECT, d);
    const next = addToSplit(withFour, PROJECT, splitId, d.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits[0].memberIds).toHaveLength(4);
    expect(p.splits[0].focusedPane).toBe("quaternary");
  });

  it("refuses a 5th member", () => {
    const base = seed(["terminal", "terminal", "terminal", "terminal", "terminal"]);
    const [a, b, c, d, e] = projectTabs(base, PROJECT).tabs;
    const withA = setActiveTab(base, PROJECT, a.id);
    let state = openTabToSide(withA, PROJECT, b.id);
    const splitId = projectTabs(state, PROJECT).splits[0].id;
    state = addToSplit(state, PROJECT, splitId, c.id);
    state = addToSplit(state, PROJECT, splitId, d.id);
    expect(projectTabs(state, PROJECT).splits[0].memberIds).toHaveLength(MAX_SPLIT_MEMBERS);
    const next = addToSplit(state, PROJECT, splitId, e.id);
    expect(next).toBe(state);
  });

  it("is a no-op when the tab is already a member", () => {
    const { state, b, splitId } = seedSplit();
    expect(addToSplit(state, PROJECT, splitId, b.id)).toBe(state);
  });

  it("is a no-op when the tab already belongs to a different split", () => {
    const base = seed(["terminal", "terminal", "terminal", "terminal"]);
    const [a, b, c, d] = projectTabs(base, PROJECT).tabs;
    const withA = setActiveTab(base, PROJECT, a.id);
    const firstSplit = openTabToSide(withA, PROJECT, b.id);
    const firstSplitId = projectTabs(firstSplit, PROJECT).splits[0].id;
    const parked = setActiveTab(firstSplit, PROJECT, c.id);
    const secondSplit = openTabToSide(parked, PROJECT, d.id);
    expect(addToSplit(secondSplit, PROJECT, firstSplitId, c.id)).toBe(secondSplit);
  });

  it("is a no-op for an ide target", () => {
    const { state, splitId } = seedSplit();
    const withIde = addTab(state, PROJECT, createTab("ide", SETTINGS));
    const ide = projectTabs(withIde, PROJECT).tabs.find((t) => t.kind === "ide");
    if (!ide) throw new Error("ide tab missing");
    expect(addToSplit(withIde, PROJECT, splitId, ide.id)).toBe(withIde);
  });

  it("is a no-op for an unknown split id", () => {
    const state = seed(["terminal", "terminal"]);
    const [, t1] = projectTabs(state, PROJECT).tabs;
    expect(addToSplit(state, PROJECT, "missing", t1.id)).toBe(state);
  });
});

describe("setSplitRowRatio", () => {
  it("is a no-op for a 2-member split (no second row yet)", () => {
    const { state, splitId } = seedSplit();
    expect(setSplitRowRatio(state, PROJECT, splitId, 0.63)).toBe(state);
  });

  it("clamps and applies once a 3rd member exists", () => {
    const { state, c, splitId } = seedSplit();
    const withThree = addToSplit(state, PROJECT, splitId, c.id);
    const next = setSplitRowRatio(withThree, PROJECT, splitId, 0.05);
    expect(projectTabs(next, PROJECT).splits[0].rowRatio).toBe(MIN_SPLIT_RATIO);
  });

  it("is a no-op for an unknown split id", () => {
    const state = seed(["terminal"]);
    expect(setSplitRowRatio(state, PROJECT, "missing", 0.63)).toBe(state);
  });
});

describe("closeTab shrinking a multi-member split", () => {
  it("shrinks a 3-member split to 2 instead of dissolving it", () => {
    const { state, a, b, c, splitId } = seedSplit();
    const withThree = addToSplit(state, PROJECT, splitId, c.id);
    const next = closeTab(withThree, PROJECT, c.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits[0]).toEqual(expect.objectContaining({ memberIds: [a.id, b.id] }));
    expect(p.viewingSplitId).toBe(splitId);
  });

  it("falls back to a nearby pane when the focused member of a 3-member split is closed", () => {
    const { state, a, b, c, splitId } = seedSplit();
    const withThree = addToSplit(state, PROJECT, splitId, c.id);
    expect(projectTabs(withThree, PROJECT).splits[0].focusedPane).toBe("tertiary");
    const next = closeTab(withThree, PROJECT, c.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits[0]).toEqual(expect.objectContaining({ memberIds: [a.id, b.id] }));
    expect(p.splits[0].focusedPane).toBe("secondary");
  });

  it("keeps the same tab focused, at its new slot, when a different member is closed", () => {
    const { state, a, b, c, splitId } = seedSplit();
    const withThree = addToSplit(state, PROJECT, splitId, c.id);
    const focusedOnB = setFocusedPane(withThree, PROJECT, splitId, "secondary");
    const next = closeTab(focusedOnB, PROJECT, a.id);
    const p = projectTabs(next, PROJECT);
    expect(p.splits[0].memberIds).toEqual([b.id, c.id]);
    expect(p.splits[0].focusedPane).toBe("primary");
  });
});

describe("split state carry-through", () => {
  it("keeps the split across rename, recolor, and reorder", () => {
    const { state, a, b, c, splitId } = seedSplit();
    const ratioed = setSplitRatio(state, PROJECT, splitId, 0.63);

    const renamed = renameTab(ratioed, PROJECT, a.id, "Renamed");
    expect(projectTabs(renamed, PROJECT).splits[0]).toEqual(
      expect.objectContaining({ memberIds: [a.id, b.id], ratio: 0.63 }),
    );

    const recolored = recolorTab(ratioed, PROJECT, a.id, "#ff0000");
    expect(projectTabs(recolored, PROJECT).splits[0].ratio).toBe(0.63);

    const reordered = reorderTabs(ratioed, PROJECT, c.id, a.id);
    expect(projectTabs(reordered, PROJECT).splits[0].ratio).toBe(0.63);
  });
});

describe("multiple independent splits", () => {
  it("lets two splits coexist, each with its own state, and view switches between them", () => {
    const base = seed(["terminal", "terminal", "terminal", "terminal"]);
    const [a, b, c, d] = projectTabs(base, PROJECT).tabs;
    const withA = setActiveTab(base, PROJECT, a.id);
    const firstSplit = openTabToSide(withA, PROJECT, b.id);
    const firstSplitId = projectTabs(firstSplit, PROJECT).splits[0].id;
    const parked = setActiveTab(firstSplit, PROJECT, c.id);
    const withSecond = openTabToSide(parked, PROJECT, d.id);
    const secondSplitId = projectTabs(withSecond, PROJECT).splits.find(
      (s) => s.id !== firstSplitId,
    )?.id;
    if (!secondSplitId) throw new Error("second split missing");

    const renamedFirst = renameSplit(withSecond, PROJECT, firstSplitId, "Frontend");
    let p = projectTabs(renamedFirst, PROJECT);
    expect(p.splits.find((s) => s.id === firstSplitId)?.title).toBe("Frontend");
    expect(p.splits.find((s) => s.id === secondSplitId)?.title).toBe("Split");
    expect(p.viewingSplitId).toBe(secondSplitId);

    const viewedFirst = viewSplit(renamedFirst, PROJECT, firstSplitId);
    p = projectTabs(viewedFirst, PROJECT);
    expect(p.viewingSplitId).toBe(firstSplitId);

    const dissolvedSecond = unsplit(viewedFirst, PROJECT, secondSplitId);
    p = projectTabs(dissolvedSecond, PROJECT);
    expect(p.splits).toHaveLength(1);
    expect(p.splits[0].id).toBe(firstSplitId);
    // Unsplitting the non-viewed split doesn't disturb which split is being viewed.
    expect(p.viewingSplitId).toBe(firstSplitId);
  });
});
