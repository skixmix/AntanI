import { describe, expect, it } from "vitest";
import {
  addTab,
  closeTab,
  createTab,
  defaultTitle,
  projectTabs,
  recolorTab,
  removeProjectTabs,
  renameTab,
  reorderTabs,
  setActiveTab,
  startupCommandForKind,
  type TabsState,
} from "./tabs";
import type { Settings } from "./types";

const SETTINGS: Settings = { claudeCommand: "claude --resume", opencodeCommand: "oc" };
const PROJECT = "proj-1";

function seed(kinds: Parameters<typeof createTab>[0][]): TabsState {
  let state: TabsState = {};
  for (const kind of kinds) {
    state = addTab(state, PROJECT, createTab(kind, SETTINGS));
  }
  return state;
}

describe("startupCommandForKind", () => {
  it("uses the configured commands for agent tabs and none for plain terminals", () => {
    expect(startupCommandForKind("claude", SETTINGS)).toBe("claude --resume");
    expect(startupCommandForKind("opencode", SETTINGS)).toBe("oc");
    expect(startupCommandForKind("terminal", SETTINGS)).toBeNull();
    expect(startupCommandForKind("ide", SETTINGS)).toBeNull();
  });
});

describe("defaultTitle", () => {
  it("labels each tab kind", () => {
    expect(defaultTitle("terminal")).toBe("Terminal");
    expect(defaultTitle("claude")).toBe("Claude");
    expect(defaultTitle("opencode")).toBe("opencode");
    expect(defaultTitle("ide")).toBe("IDE");
  });
});

describe("addTab", () => {
  it("appends the tab and makes it active", () => {
    const state = seed(["terminal", "claude"]);
    const pt = projectTabs(state, PROJECT);
    expect(pt.tabs).toHaveLength(2);
    expect(pt.activeTabId).toBe(pt.tabs[1].id);
  });

  it("snapshots the launch command onto the tab", () => {
    const state = seed(["claude"]);
    expect(projectTabs(state, PROJECT).tabs[0].startupCommand).toBe("claude --resume");
  });
});

describe("closeTab", () => {
  it("selects the right-hand neighbor when closing the active tab", () => {
    const state = seed(["terminal", "claude", "opencode"]);
    const [t0, t1, t2] = projectTabs(state, PROJECT).tabs;
    const afterActivateMiddle = { ...state, [PROJECT]: { ...state[PROJECT], activeTabId: t1.id } };
    const closed = closeTab(afterActivateMiddle, PROJECT, t1.id);
    const pt = projectTabs(closed, PROJECT);
    expect(pt.tabs.map((t) => t.id)).toEqual([t0.id, t2.id]);
    expect(pt.activeTabId).toBe(t2.id);
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
    const pt = projectTabs(closed, PROJECT);
    expect(pt.tabs).toHaveLength(0);
    expect(pt.activeTabId).toBeNull();
  });

  it("keeps the active tab when a different tab is closed", () => {
    const state = seed(["terminal", "claude", "opencode"]);
    const [t0, t1, t2] = projectTabs(state, PROJECT).tabs;
    const closed = closeTab(state, PROJECT, t0.id);
    const pt = projectTabs(closed, PROJECT);
    expect(pt.activeTabId).toBe(t2.id);
    expect(pt.tabs.map((t) => t.id)).toEqual([t1.id, t2.id]);
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
    expect(projectTabs({}, PROJECT)).toEqual({ tabs: [], activeTabId: null });
  });
});

describe("setActiveTab", () => {
  it("switches the active tab", () => {
    const state = seed(["terminal", "claude"]);
    const [t0, t1] = projectTabs(state, PROJECT).tabs;
    const next = setActiveTab(state, PROJECT, t0.id);
    expect(projectTabs(next, PROJECT).activeTabId).toBe(t0.id);
    void t1;
  });

  it("is a no-op for an unknown tab id", () => {
    const state = seed(["terminal"]);
    const next = setActiveTab(state, PROJECT, "missing");
    expect(next).toBe(state);
  });
});

describe("renameTab", () => {
  it("renames the matching tab and leaves others untouched", () => {
    const state = seed(["terminal", "claude"]);
    const [t0, t1] = projectTabs(state, PROJECT).tabs;
    const next = renameTab(state, PROJECT, t0.id, "My Terminal");
    const pt = projectTabs(next, PROJECT);
    expect(pt.tabs[0].title).toBe("My Terminal");
    expect(pt.tabs[1].title).toBe(t1.title);
  });
});

describe("recolorTab", () => {
  it("recolors the matching tab", () => {
    const state = seed(["terminal"]);
    const [t0] = projectTabs(state, PROJECT).tabs;
    const next = recolorTab(state, PROJECT, t0.id, "#ff0000");
    expect(projectTabs(next, PROJECT).tabs[0].color).toBe("#ff0000");
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
