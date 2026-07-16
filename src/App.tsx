import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FirstRunVscodeModal } from "./components/FirstRunVscodeModal";
import { ImportVscodeModal } from "./components/ImportVscodeModal";
import {
  type CommandsSubTab,
  SettingsPage,
  type TabId as SettingsTabId,
} from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import type { TerminalFileOpenTarget } from "./components/terminalFileLinkProvider";
import { useIdeFileOpen } from "./components/useIdeFileOpen";
import { Workspace } from "./components/Workspace";
import * as api from "./lib/api.ipc";
import { basename, defaultColorForIndex, MAX_QUICK_SWITCH } from "./lib/constants";
import { initNotifications, notifyAgentReady, notifyAgentWaiting } from "./lib/notifications.ipc";
import { playSystemSound } from "./lib/sound.ipc";
import {
  activePaneTabs,
  addTab,
  addToSplit,
  closeTab,
  createCustomTab,
  createTab,
  findTabOwner,
  openTabToSide,
  type PaneId,
  projectTabs,
  recolorSplit,
  recolorTab,
  removeProjectTabs,
  renameSplit,
  renameTab,
  reorderTabs,
  setActiveTab,
  setFocusedPane,
  setSplitRatio,
  setSplitRowRatio,
  swapPanes,
  type TabKind,
  type TabStatus,
  type TabsState,
  unsplit,
  viewSplit,
} from "./lib/tabs";
import type { AppData, CustomCommand, InjectTarget, Settings } from "./lib/types";
import { isNewerVersion } from "./lib/updateCheck";
import { fetchLatestVersion } from "./lib/updateCheck.ipc";

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tabs, setTabs] = useState<TabsState>({});
  const [tabStatuses, setTabStatuses] = useState<Record<string, TabStatus>>({});
  // Plain-terminal-tab counterpart to tabStatuses: whether a job (not the
  // login shell) currently holds the pty's foreground process group. No
  // notification/glow semantics attached, unlike tabStatuses.
  const [runningTabs, setRunningTabs] = useState<Record<string, true>>({});
  // Tabs/projects with an unresolved "ready"/"waiting" event the user hasn't
  // looked at yet — drives the sidebar/tab-chip attention glow. Distinct from
  // tabStatuses: a tab can be "waiting" but no longer need a glow once viewed.
  const [needsAttention, setNeedsAttention] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId | null>(null);
  const [settingsCommandsSubTab, setSettingsCommandsSubTab] = useState<CommandsSubTab>("custom");
  const [showFirstRunImportModal, setShowFirstRunImportModal] = useState(false);
  const [pendingIdeOpenProjectId, setPendingIdeOpenProjectId] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    void api.getAppVersion().then(setAppVersion);
  }, []);

  // One-shot check on launch, not polled — this is a single-user local tool,
  // not worth a background timer just to catch a release that lands mid-session.
  useEffect(() => {
    if (!appVersion) return;
    void fetchLatestVersion().then((latest) => {
      if (latest && isNewerVersion(appVersion, latest)) setUpdateVersion(latest);
    });
  }, [appVersion]);

  // Latest-value refs so handleStatusChange (below) can stay referentially
  // stable — it's a TerminalView effect dependency, and a new identity on
  // every tabs/data change would respawn every AI tab's pty.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const projectsRef = useRef(data?.projects ?? []);
  projectsRef.current = data?.projects ?? [];
  const activeProjectIdRef = useRef(data?.activeProjectId ?? null);
  activeProjectIdRef.current = data?.activeProjectId ?? null;
  // Tabs already notified for their current unresolved "waiting" prompt —
  // cleared as soon as the tab leaves "waiting" for any reason, so a later,
  // distinct prompt (e.g. the next tool call's permission check) notifies again.
  const notifiedWaitingRef = useRef(new Set<string>());
  const tabStatusesRef = useRef(tabStatuses);
  tabStatusesRef.current = tabStatuses;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Tracks the native window's actual focus state, not document.hasFocus():
  // the embedded VS Code IDE runs as a separate child webview, so keyboard
  // focus can sit there (or shift during terminal interaction) while the OS
  // window is still frontmost — document.hasFocus() on the main webview's own
  // document would then wrongly report "unfocused" and fire notifications
  // the user is actually looking right at.
  const windowFocusedRef = useRef(true);

  useEffect(() => {
    Promise.all([api.getAppState(), api.getSettings()])
      .then(([appData, appSettings]) => {
        setData(appData);
        setSettings(appSettings);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Suppress the browser's native context menu (Reload, Back, Services, ...)
  // globally in production so the app feels native rather than like a web
  // page — not a security measure: devtools are gated by the Tauri
  // `devtools` Cargo feature (absent from release builds) regardless of this.
  // Left enabled in dev so right-click can still reach devtools/inspect.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const block = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", block);
    return () => window.removeEventListener("contextmenu", block);
  }, []);

  const run = useCallback(async (op: () => Promise<AppData>) => {
    try {
      setData(await op());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void initNotifications((projectId, tabId) => {
      const owner = findTabOwner(tabsRef.current, tabId);
      // setActiveTab parks any split to show a solo tab, or views the split and focuses that pane if the tab is a split member
      if (owner) setTabs((t) => setActiveTab(t, projectId, owner.tab.id));
      void run(() => api.setActiveProject(projectId));
    });
  }, [run]);

  const handleAdd = useCallback(async () => {
    try {
      const path = await api.pickFolder();
      if (!path) return;
      if (data?.projects.some((p) => p.path === path)) {
        setError(`Project "${basename(path)}" is already open.`);
        return;
      }
      const index = data?.projects.length ?? 0;
      await run(() => api.addProject(path, basename(path), defaultColorForIndex(index)));
    } catch (e) {
      setError(String(e));
    }
  }, [data, run]);

  const handleRemove = useCallback(
    (id: string) => {
      setTabs((t) => removeProjectTabs(t, id));
      void run(() => api.removeProject(id));
    },
    [run],
  );

  const handleAddCustomCommand = useCallback(
    (projectId: string, name: string, command: string, color: string) =>
      run(() => api.addCustomCommand(projectId, name, command, color)),
    [run],
  );

  const handleRemoveCustomCommand = useCallback(
    (projectId: string, commandId: string) =>
      run(() => api.removeCustomCommand(projectId, commandId)),
    [run],
  );

  const handleUpdateCustomCommand = useCallback(
    (projectId: string, commandId: string, name: string, command: string, color: string) =>
      run(() => api.updateCustomCommand(projectId, commandId, name, command, color)),
    [run],
  );

  const handleAddInjectable = useCallback(
    (projectId: string, name: string, text: string, target: InjectTarget, color: string) =>
      run(() => api.addInjectable(projectId, name, text, target, color)),
    [run],
  );

  const handleRemoveInjectable = useCallback(
    (projectId: string, injectableId: string) =>
      run(() => api.removeInjectable(projectId, injectableId)),
    [run],
  );

  const handleUpdateInjectable = useCallback(
    (
      projectId: string,
      injectableId: string,
      name: string,
      text: string,
      target: InjectTarget,
      color: string,
    ) => run(() => api.updateInjectable(projectId, injectableId, name, text, target, color)),
    [run],
  );

  const activeId = data?.activeProjectId ?? null;

  const openTab = useCallback(
    (kind: TabKind) => {
      if (!activeId || !settings) return;
      setTabs((t) => addTab(t, activeId, createTab(kind, settings)));
    },
    [activeId, settings],
  );

  const openCustomTab = useCallback(
    (cmd: CustomCommand) => {
      if (!activeId) return;
      setTabs((t) => addTab(t, activeId, createCustomTab(cmd)));
    },
    [activeId],
  );

  const selectTab = useCallback(
    (tabId: string) => {
      if (!activeId) return;
      setTabs((t) => setActiveTab(t, activeId, tabId));
    },
    [activeId],
  );

  const handleSelectProject = useCallback(
    (id: string) => {
      if (data?.activeProjectId !== id) {
        const waitingTab = projectTabs(tabs, id).tabs.find(
          (tab) => tabStatuses[tab.id] === "waiting",
        );
        // setActiveTab views the split and focuses the tab's pane if it is a split member, else parks the split to show it solo
        if (waitingTab) setTabs((t) => setActiveTab(t, id, waitingTab.id));
      }
      void run(() => api.setActiveProject(id));
    },
    [data?.activeProjectId, tabs, tabStatuses, run],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      if (!activeId) return;
      setTabs((t) => closeTab(t, activeId, tabId));
      setTabStatuses((s) => {
        const next = { ...s };
        delete next[tabId];
        return next;
      });
      setRunningTabs((s) => {
        if (!(tabId in s)) return s;
        const next = { ...s };
        delete next[tabId];
        return next;
      });
      setNeedsAttention((s) => {
        if (!(tabId in s)) return s;
        const next = { ...s };
        delete next[tabId];
        return next;
      });
    },
    [activeId],
  );

  const handleStatusChange = useCallback((tabId: string, status: TabStatus) => {
    const prevStatus = tabStatusesRef.current[tabId];
    // Dedupe against the ref (updated synchronously right here), not React
    // state: TerminalView can fire two "waiting" calls back-to-back — e.g. a
    // permission prompt that redraws across two write flushes — faster than
    // a render can land, so a state-only check would see the same stale
    // prevStatus twice and double-notify.
    if (prevStatus === status) return;
    tabStatusesRef.current = { ...tabStatusesRef.current, [tabId]: status };

    let notify = false;
    if (status === "ready" && prevStatus === "busy") {
      notify = true;
    } else if (status === "waiting") {
      notify = !notifiedWaitingRef.current.has(tabId);
      notifiedWaitingRef.current.add(tabId);
    }
    if (status !== "waiting") {
      notifiedWaitingRef.current.delete(tabId);
    }
    if (notify) {
      const owner = findTabOwner(tabsRef.current, tabId);
      const project = projectsRef.current.find((p) => p.id === owner?.projectId);
      const ownerPt = owner ? tabsRef.current[owner.projectId] : undefined;
      const panes = ownerPt
        ? activePaneTabs(ownerPt)
        : { primary: null, secondary: null, tertiary: null, quaternary: null };
      const isVisiblePaneTab =
        panes.primary?.id === tabId ||
        panes.secondary?.id === tabId ||
        panes.tertiary?.id === tabId ||
        panes.quaternary?.id === tabId;
      const isOpenTab =
        !!owner && activeProjectIdRef.current === owner.projectId && isVisiblePaneTab;
      if (owner && project) {
        const focusedOnTab = isOpenTab && windowFocusedRef.current;
        // No glow or system notification when already looking at this tab.
        if (!focusedOnTab) {
          setNeedsAttention((s) => (s[tabId] ? s : { ...s, [tabId]: true }));
          // System notifications are for when the user isn't looking at the app
          // at all — while it's focused, the glow above is the "look at me"
          // signal instead, even for a background tab/project.
          const notificationsEnabled = settingsRef.current?.notificationsEnabled ?? true;
          if (notificationsEnabled && !windowFocusedRef.current) {
            const notifyFn = status === "ready" ? notifyAgentReady : notifyAgentWaiting;
            notifyFn(project.name, owner.tab.title, owner.projectId, tabId);
          }
        }
        // Sound plays for any tab transition when enabled — including the
        // currently open tab.
        if (settingsRef.current?.soundEnabled ?? true) {
          const soundName =
            status === "ready"
              ? (settingsRef.current?.soundReady ?? "Glass")
              : (settingsRef.current?.soundWaiting ?? "Ping");
          void playSystemSound(soundName);
        }
      }
    }
    setTabStatuses(tabStatusesRef.current);
  }, []);
  const handleRunningChange = useCallback((tabId: string, running: boolean) => {
    setRunningTabs((s) => {
      const wasRunning = tabId in s;
      if (running === wasRunning) return s;
      const next = { ...s };
      if (running) next[tabId] = true;
      else delete next[tabId];
      return next;
    });
  }, []);
  const handleRenameTab = useCallback(
    (tabId: string, title: string) =>
      activeId && setTabs((t) => renameTab(t, activeId, tabId, title)),
    [activeId],
  );
  const handleRecolorTab = useCallback(
    (tabId: string, color: string) =>
      activeId && setTabs((t) => recolorTab(t, activeId, tabId, color)),
    [activeId],
  );
  const handleReorderTab = useCallback(
    (fromId: string, insertBeforeId: string | null) =>
      activeId && setTabs((t) => reorderTabs(t, activeId, fromId, insertBeforeId)),
    [activeId],
  );

  const handleOpenToSide = useCallback(
    (tabId: string) => {
      if (!activeId) return;
      setTabs((t) => openTabToSide(t, activeId, tabId));
    },
    [activeId],
  );

  const handleAddToSplit = useCallback(
    (tabId: string) => {
      if (!activeId) return;
      setTabs((t) => addToSplit(t, activeId, tabId));
    },
    [activeId],
  );

  const handleUnsplit = useCallback(() => {
    if (!activeId) return;
    setTabs((t) => unsplit(t, activeId));
  }, [activeId]);

  const handleFocusPane = useCallback(
    (pane: PaneId) => {
      if (!activeId) return;
      setTabs((t) => setFocusedPane(t, activeId, pane));
    },
    [activeId],
  );

  const handleSetSplitRatio = useCallback(
    (ratio: number) => {
      if (!activeId) return;
      setTabs((t) => setSplitRatio(t, activeId, ratio));
    },
    [activeId],
  );

  const handleSetSplitRowRatio = useCallback(
    (ratio: number) => {
      if (!activeId) return;
      setTabs((t) => setSplitRowRatio(t, activeId, ratio));
    },
    [activeId],
  );

  const handleViewSplit = useCallback(() => {
    if (!activeId) return;
    setTabs((t) => viewSplit(t, activeId));
  }, [activeId]);

  const handleRenameSplit = useCallback(
    (title: string) => {
      if (!activeId) return;
      setTabs((t) => renameSplit(t, activeId, title));
    },
    [activeId],
  );

  const handleRecolorSplit = useCallback(
    (color: string) => {
      if (!activeId) return;
      setTabs((t) => recolorSplit(t, activeId, color));
    },
    [activeId],
  );

  const handleSwapPanes = useCallback(
    (paneA: PaneId, paneB: PaneId) => {
      if (!activeId) return;
      setTabs((t) => swapPanes(t, activeId, paneA, paneB));
    },
    [activeId],
  );

  const openIdeNow = useCallback(
    (id: string) => {
      if (!settings) return;
      setTabs((t) => {
        const existing = projectTabs(t, id).tabs.find((tab) => tab.kind === "ide");
        if (existing) return setActiveTab(t, id, existing.id);
        return addTab(t, id, createTab("ide", settings));
      });
    },
    [settings],
  );

  const requestOpenIde = useCallback(
    (id: string) => {
      if (settings && !settings.vscodeImportPrompted) {
        setPendingIdeOpenProjectId(id);
        setShowFirstRunImportModal(true);
        return;
      }
      openIdeNow(id);
    },
    [settings, openIdeNow],
  );

  const handleOpenIde = useCallback(() => {
    if (!activeId) return;
    requestOpenIde(activeId);
  }, [activeId, requestOpenIde]);
  const openFileInIde = useIdeFileOpen(tabs, requestOpenIde);
  const handleOpenFile = useCallback(
    (target: TerminalFileOpenTarget) => {
      switch (target.kind) {
        case "ide":
          if (activeProjectIdRef.current !== target.projectId) {
            void run(() => api.setActiveProject(target.projectId));
          }
          openFileInIde(target.projectId, target.projectPath, target.file);
          break;
        case "finder":
          void revealItemInDir(target.filePath).catch((error: unknown) => setError(String(error)));
          break;
        default: {
          const unexpected: never = target;
          return unexpected;
        }
      }
    },
    [openFileInIde, run],
  );

  const markVscodeImportPrompted = useCallback(async () => {
    if (!settings || settings.vscodeImportPrompted) return;
    const updated = { ...settings, vscodeImportPrompted: true };
    // Persist before flipping local state — if the save fails, the flag must
    // stay false so the prompt is offered again next launch instead of
    // silently never persisting and never re-prompting either.
    try {
      await api.updateSettings(updated);
      setSettings(updated);
    } catch (e) {
      setError(String(e));
    }
  }, [settings]);

  const handleFirstRunFinish = useCallback(() => {
    setShowFirstRunImportModal(false);
    void markVscodeImportPrompted();
    const id = pendingIdeOpenProjectId;
    setPendingIdeOpenProjectId(null);
    if (id) openIdeNow(id);
  }, [markVscodeImportPrompted, pendingIdeOpenProjectId, openIdeNow]);

  const handleUpdateSettings = useCallback(
    (patch: Partial<Settings>) => {
      if (!settings) return;
      const updated = { ...settings, ...patch };
      setSettings(updated);
      void api.updateSettings(updated).catch((e) => setError(String(e)));
    },
    [settings],
  );

  useEffect(() => {
    function onQuickSwitch(e: Event) {
      const n = (e as CustomEvent<number>).detail;
      if (!Number.isInteger(n) || n < 1 || n > MAX_QUICK_SWITCH) return;
      const project = data?.projects[n - 1];
      if (project) void run(() => api.setActiveProject(project.id));
    }
    window.addEventListener("antani:quick-switch", onQuickSwitch);
    return () => window.removeEventListener("antani:quick-switch", onQuickSwitch);
  }, [data, run]);

  // Clear a tab's attention glow as soon as the user is actually looking at
  // it (visible tab + window focused) — on mount, whenever the visible tab
  // changes, and when the window regains focus while already parked on it.
  const activePt = activeId ? tabs[activeId] : undefined;
  const {
    primary: visiblePrimary,
    secondary: visibleSecondary,
    tertiary: visibleTertiary,
    quaternary: visibleQuaternary,
  } = activePt
    ? activePaneTabs(activePt)
    : { primary: null, secondary: null, tertiary: null, quaternary: null };
  const visibleTabIds = [
    visiblePrimary?.id,
    visibleSecondary?.id,
    visibleTertiary?.id,
    visibleQuaternary?.id,
  ].filter((x): x is string => x !== undefined);
  const visibleTabIdsRef = useRef(visibleTabIds);
  visibleTabIdsRef.current = visibleTabIds;

  const clearAttentionIfFocused = useCallback((tabIds: string[]) => {
    if (!windowFocusedRef.current || tabIds.length === 0) return;
    setNeedsAttention((s) => {
      const toRemove = tabIds.filter((id) => id in s);
      if (toRemove.length === 0) return s;
      const next = { ...s };
      for (const id of toRemove) delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    clearAttentionIfFocused(visibleTabIds);
  }, [visibleTabIds, clearAttentionIfFocused]);

  // Native window focus, not document.hasFocus(): the embedded VS Code IDE is
  // a separate child webview, so DOM focus can be elsewhere in the app while
  // the OS window is still frontmost.
  useEffect(() => {
    const win = getCurrentWindow();
    void win.isFocused().then((focused) => {
      windowFocusedRef.current = focused;
    });
    let unlisten: (() => void) | undefined;
    void win
      .onFocusChanged(({ payload: focused }) => {
        windowFocusedRef.current = focused;
        if (focused) clearAttentionIfFocused(visibleTabIdsRef.current);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [clearAttentionIfFocused]);

  // "ready" (green, at-prompt) doesn't count as activity here — only an
  // in-flight response ("busy") or a blocked permission prompt ("waiting")
  // should surface at the project level, same as the per-tab dot.
  const projectStatuses = useMemo(() => {
    const statuses: Record<string, "busy" | "waiting"> = {};
    for (const projectId of Object.keys(tabs)) {
      let status: "busy" | "waiting" | undefined;
      for (const tab of projectTabs(tabs, projectId).tabs) {
        const tabStatus = tabStatuses[tab.id];
        if (tabStatus === "waiting") status = "waiting";
        else if (tabStatus === "busy" && status !== "waiting") status = "busy";
      }
      if (status) statuses[projectId] = status;
    }
    return statuses;
  }, [tabs, tabStatuses]);

  // Which color the project row's glow should echo — "waiting" (red) wins
  // over "ready" (green) if a project has tabs needing attention for both.
  const projectNeedsAttention = useMemo(() => {
    const result: Record<string, "ready" | "waiting"> = {};
    for (const projectId of Object.keys(tabs)) {
      let kind: "ready" | "waiting" | undefined;
      for (const tab of projectTabs(tabs, projectId).tabs) {
        if (!needsAttention[tab.id]) continue;
        if (tabStatuses[tab.id] === "waiting") kind = "waiting";
        else if (tabStatuses[tab.id] === "ready" && kind !== "waiting") kind = "ready";
      }
      if (kind) result[projectId] = kind;
    }
    return result;
  }, [tabs, needsAttention, tabStatuses]);

  const projectsWithActivity = useMemo(() => {
    const result = new Set<string>();
    for (const [id, ptabs] of Object.entries(tabs)) {
      if (ptabs.tabs.length > 0) result.add(id);
    }
    return result;
  }, [tabs]);

  if (!data || !settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {error ? <span className="text-destructive">{error}</span> : "Loading…"}
      </div>
    );
  }

  const active = data.projects.find((p) => p.id === data.activeProjectId) ?? null;
  return (
    <div className="flex h-full w-full flex-col bg-background">
      {import.meta.env.DEV && (
        <div className="flex h-5 shrink-0 items-center justify-center bg-primary text-[10px] font-semibold tracking-wide text-primary-foreground">
          DEV BUILD
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          projects={data.projects}
          activeProjectId={data.activeProjectId}
          projectsWithActivity={projectsWithActivity}
          projectStatuses={projectStatuses}
          projectNeedsAttention={projectNeedsAttention}
          onAdd={handleAdd}
          onSelect={handleSelectProject}
          onRename={(id, name) => run(() => api.renameProject(id, name))}
          onRecolor={(id, color) => run(() => api.setProjectColor(id, color))}
          onRemove={handleRemove}
          onReorder={(ids) => run(() => api.reorderProjects(ids))}
          onOpenSettings={() => setSettingsInitialTab("general")}
        />
        <Workspace
          project={active}
          projects={data.projects}
          tabs={tabs}
          tabStatuses={tabStatuses}
          runningTabs={runningTabs}
          needsAttention={needsAttention}
          terminalFontSize={settings.terminalFontSize}
          onOpenTab={openTab}
          onOpenCustomTab={openCustomTab}
          onOpenCommandSettings={(subTab) => {
            setSettingsCommandsSubTab(subTab ?? "custom");
            setSettingsInitialTab("commands");
          }}
          onSelectTab={selectTab}
          onCloseTab={handleCloseTab}
          onRenameTab={handleRenameTab}
          onRecolorTab={handleRecolorTab}
          onReorderTab={handleReorderTab}
          onOpenIde={handleOpenIde}
          onStatusChange={handleStatusChange}
          onRunningChange={handleRunningChange}
          onOpenFile={handleOpenFile}
          onOpenToSide={handleOpenToSide}
          onAddToSplit={handleAddToSplit}
          onUnsplit={handleUnsplit}
          onFocusPane={handleFocusPane}
          onSetSplitRatio={handleSetSplitRatio}
          onSetSplitRowRatio={handleSetSplitRowRatio}
          onSwapPanes={handleSwapPanes}
          onViewSplit={handleViewSplit}
          onRenameSplit={handleRenameSplit}
          onRecolorSplit={handleRecolorSplit}
        />
      </div>

      <StatusBar
        project={active}
        version={appVersion}
        updateVersion={updateVersion}
        onOpenCustomTab={openCustomTab}
      />

      {settingsInitialTab && (
        <SettingsPage
          settings={settings}
          project={active}
          initialTab={settingsInitialTab}
          initialCommandsSubTab={settingsCommandsSubTab}
          onClose={() => setSettingsInitialTab(null)}
          onImportVscode={() => setShowImportModal(true)}
          onUpdateSettings={handleUpdateSettings}
          onAddCustomCommand={handleAddCustomCommand}
          onRemoveCustomCommand={handleRemoveCustomCommand}
          onUpdateCustomCommand={handleUpdateCustomCommand}
          onAddInjectable={handleAddInjectable}
          onRemoveInjectable={handleRemoveInjectable}
          onUpdateInjectable={handleUpdateInjectable}
        />
      )}

      {showImportModal && (
        <ImportVscodeModal
          onClose={() => {
            setShowImportModal(false);
            setTabs((t) => {
              const next = { ...t };
              for (const [projectId, ptabs] of Object.entries(next)) {
                const filtered = ptabs.tabs.filter((tab) => tab.kind !== "ide");
                if (filtered.length !== ptabs.tabs.length) {
                  const activeTabId =
                    ptabs.activeTabId && filtered.some((tab) => tab.id === ptabs.activeTabId)
                      ? ptabs.activeTabId
                      : (filtered[filtered.length - 1]?.id ?? null);
                  next[projectId] = { ...ptabs, tabs: filtered, activeTabId };
                }
              }
              return next;
            });
          }}
        />
      )}

      {showFirstRunImportModal && <FirstRunVscodeModal onFinish={handleFirstRunFinish} />}

      {error && (
        <div className="fixed bottom-3 right-3 z-50 max-w-sm rounded-md border border-destructive bg-destructive/90 px-3 py-2 text-xs text-foreground shadow-lg">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 underline decoration-foreground/50 hover:text-foreground"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
