import { describe, expect, it } from "vitest";
import {
  addTab,
  closeTab,
  createTab,
  defaultTitle,
  projectTabs,
  removeProjectTabs,
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
});
