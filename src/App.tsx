import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FirstRunVscodeModal } from "./components/FirstRunVscodeModal";
import { FreeRamModal } from "./components/FreeRamModal";
import { ImportVscodeModal } from "./components/ImportVscodeModal";
import { SettingsPage, type TabId as SettingsTabId } from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { Workspace } from "./components/Workspace";
import * as api from "./lib/api.ipc";
import { basename, defaultColorForIndex, MAX_QUICK_SWITCH } from "./lib/constants";
import { initNotifications, notifyAgentReady, notifyAgentWaiting } from "./lib/notifications.ipc";
import { playSystemSound } from "./lib/sound.ipc";
import {
  addTab,
  closeTab,
  createCustomTab,
  createTab,
  findTabOwner,
  projectTabs,
  recolorTab,
  removeProjectTabs,
  renameTab,
  reorderTabs,
  setActiveTab,
  type TabKind,
  type TabStatus,
  type TabsState,
} from "./lib/tabs";
import type { AppData, CustomCommand, Settings } from "./lib/types";

const MEM_POLL_MS = 10_000;

function useVscodeMemory() {
  const [memMb, setMemMb] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const mb = await api.getVscodeMemoryMb();
      setMemMb(mb);
    } catch {
      setMemMb(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    timerRef.current = setInterval(() => void refresh(), MEM_POLL_MS);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [refresh]);

  // Refresh immediately when the server becomes ready — this is the earliest
  // moment a real RSS value is available; polling would lag by up to MEM_POLL_MS.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void api
      .onIdeServerStatus((event) => {
        if (event.status === "ready") void refresh();
        // Refresh on stop/fail too so the display snaps to "off" immediately.
        if (event.status === "failed") void refresh();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [refresh]);

  return { memMb, refreshMem: refresh };
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tabs, setTabs] = useState<TabsState>({});
  const [tabStatuses, setTabStatuses] = useState<Record<string, TabStatus>>({});
  // Tabs/projects with an unresolved "ready"/"waiting" event the user hasn't
  // looked at yet — drives the sidebar/tab-chip attention glow. Distinct from
  // tabStatuses: a tab can be "waiting" but no longer need a glow once viewed.
  const [needsAttention, setNeedsAttention] = useState<Record<string, true>>({});
  const [ideOpenByProject, setIdeOpenByProject] = useState<Record<string, boolean>>({});
  const [ideEverOpenedByProject, setIdeEverOpenedByProject] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [showFreeRamModal, setShowFreeRamModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId | null>(null);
  const [showFirstRunImportModal, setShowFirstRunImportModal] = useState(false);
  const [pendingIdeOpenProjectId, setPendingIdeOpenProjectId] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("");

  const { memMb, refreshMem } = useVscodeMemory();

  useEffect(() => {
    void api.getAppVersion().then(setAppVersion);
  }, []);

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

  // Suppress browser native context menu globally.
  useEffect(() => {
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

  const activeId = data?.activeProjectId ?? null;

  const openTab = useCallback(
    (kind: TabKind) => {
      if (!activeId || !settings) return;
      setTabs((t) => addTab(t, activeId, createTab(kind, settings)));
      setIdeOpenByProject((prev) => ({ ...prev, [activeId]: false }));
    },
    [activeId, settings],
  );

  const openCustomTab = useCallback(
    (cmd: CustomCommand) => {
      if (!activeId) return;
      setTabs((t) => addTab(t, activeId, createCustomTab(cmd)));
      setIdeOpenByProject((prev) => ({ ...prev, [activeId]: false }));
    },
    [activeId],
  );

  const selectTab = useCallback(
    (tabId: string) => {
      if (!activeId) return;
      setTabs((t) => setActiveTab(t, activeId, tabId));
      setIdeOpenByProject((prev) => ({ ...prev, [activeId]: false }));
    },
    [activeId],
  );

  const handleSelectProject = useCallback(
    (id: string) => {
      if (data?.activeProjectId !== id) {
        const waitingTab = projectTabs(tabs, id).tabs.find(
          (tab) => tabStatuses[tab.id] === "waiting",
        );
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
      const isOpenTab =
        owner &&
        activeProjectIdRef.current === owner.projectId &&
        tabsRef.current[owner.projectId]?.activeTabId === tabId;
      // Already looking right at this tab with the window focused — no glow,
      // no system notification needed.
      if (owner && project && !(isOpenTab && windowFocusedRef.current)) {
        setNeedsAttention((s) => (s[tabId] ? s : { ...s, [tabId]: true }));
        // System notifications are for when the user isn't looking at the app
        // at all — while it's focused, the glow above is the "look at me"
        // signal instead, even for a background tab/project.
        const notificationsEnabled = settingsRef.current?.notificationsEnabled ?? true;
        if (notificationsEnabled && !windowFocusedRef.current) {
          const notifyFn = status === "ready" ? notifyAgentReady : notifyAgentWaiting;
          notifyFn(project.name, owner.tab.title, owner.projectId, tabId);
        }
        // Unlike the OS notification above, sound isn't gated on window
        // focus — it's the "look at me" signal even while the app itself is
        // the focused app, just not on this exact tab.
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

  const openIdeNow = useCallback(
    (id: string) => {
      setIdeEverOpenedByProject((prev) => ({ ...prev, [id]: true }));
      setIdeOpenByProject((prev) => ({ ...prev, [id]: true }));
      void refreshMem();
    },
    [refreshMem],
  );

  // The very first time ever (across the whole app history, not per-project)
  // that the user opens the embedded VS Code, park the open and show the
  // one-time import prompt instead — actual opening resumes once it's answered.
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

  // Fully stops VS Code for the active project — the only action that does,
  // as opposed to selectTab/handleOpenIde which just hide/show its pane.
  const handleCloseIde = useCallback(() => {
    if (!activeId) return;
    setIdeOpenByProject((prev) => ({ ...prev, [activeId]: false }));
    setIdeEverOpenedByProject((prev) => ({ ...prev, [activeId]: false }));
    void refreshMem();
  }, [activeId, refreshMem]);

  // Unlike handleCloseIde, always ends in "open" — used when an action (e.g.
  // viewing a diff) needs the IDE tab visible, regardless of its prior state.
  const handleOpenIde = useCallback(() => {
    if (!activeId) return;
    requestOpenIde(activeId);
  }, [activeId, requestOpenIde]);

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

  const handleKillAllIde = useCallback(async () => {
    await api.closeAllIdeWebviews();
    setIdeOpenByProject({});
    setIdeEverOpenedByProject({});
    setShowFreeRamModal(false);
    void refreshMem();
  }, [refreshMem]);

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
  const visibleTabId = activeId ? (tabs[activeId]?.activeTabId ?? null) : null;
  const visibleTabIdRef = useRef(visibleTabId);
  visibleTabIdRef.current = visibleTabId;

  const clearAttentionIfFocused = useCallback((tabId: string | null) => {
    if (!tabId || !windowFocusedRef.current) return;
    setNeedsAttention((s) => {
      if (!s[tabId]) return s;
      const next = { ...s };
      delete next[tabId];
      return next;
    });
  }, []);

  useEffect(() => {
    clearAttentionIfFocused(visibleTabId);
  }, [visibleTabId, clearAttentionIfFocused]);

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
        if (focused) clearAttentionIfFocused(visibleTabIdRef.current);
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

  if (!data || !settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {error ? <span className="text-destructive">{error}</span> : "Loading…"}
      </div>
    );
  }

  const active = data.projects.find((p) => p.id === data.activeProjectId) ?? null;
  const ideOpen = activeId ? (ideOpenByProject[activeId] ?? false) : false;
  const ideRunning = activeId ? (ideEverOpenedByProject[activeId] ?? false) : false;
  const ideInstanceCount = Object.values(ideEverOpenedByProject).filter(Boolean).length;
  const showFreeRamButton = ideInstanceCount > 0 && memMb !== null && memMb >= 1024;

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
          projectStatuses={projectStatuses}
          projectNeedsAttention={projectNeedsAttention}
          onAdd={handleAdd}
          onSelect={handleSelectProject}
          onRename={(id, name) => run(() => api.renameProject(id, name))}
          onRecolor={(id, color) => run(() => api.setProjectColor(id, color))}
          onRemove={handleRemove}
          onReorder={(ids) => run(() => api.reorderProjects(ids))}
          showFreeRamButton={showFreeRamButton}
          onFreeRam={() => setShowFreeRamModal(true)}
          onOpenSettings={() => setSettingsInitialTab("general")}
        />
        <Workspace
          project={active}
          projects={data.projects}
          tabs={tabs}
          tabStatuses={tabStatuses}
          needsAttention={needsAttention}
          ideOpen={ideOpen}
          ideRunning={ideRunning}
          ideEverOpenedByProject={ideEverOpenedByProject}
          ideInstanceCount={ideInstanceCount}
          memMb={memMb}
          onOpenTab={openTab}
          onOpenCustomTab={openCustomTab}
          onOpenCommandSettings={() => setSettingsInitialTab("commands")}
          onSelectTab={selectTab}
          onCloseTab={handleCloseTab}
          onRenameTab={handleRenameTab}
          onRecolorTab={handleRecolorTab}
          onReorderTab={handleReorderTab}
          onCloseIde={handleCloseIde}
          onOpenIde={handleOpenIde}
          onStatusChange={handleStatusChange}
        />
      </div>

      <StatusBar project={active} version={appVersion} />

      {settingsInitialTab && (
        <SettingsPage
          settings={settings}
          project={active}
          initialTab={settingsInitialTab}
          onClose={() => setSettingsInitialTab(null)}
          onImportVscode={() => setShowImportModal(true)}
          onUpdateSettings={handleUpdateSettings}
          onAddCustomCommand={handleAddCustomCommand}
          onRemoveCustomCommand={handleRemoveCustomCommand}
          onUpdateCustomCommand={handleUpdateCustomCommand}
        />
      )}

      {showImportModal && (
        <ImportVscodeModal
          onClose={() => {
            setShowImportModal(false);
            // Reset IDE state so IdeView remounts cleanly on next open.
            setIdeOpenByProject({});
            setIdeEverOpenedByProject({});
            void refreshMem();
          }}
        />
      )}

      {showFirstRunImportModal && <FirstRunVscodeModal onFinish={handleFirstRunFinish} />}

      {showFreeRamModal && memMb !== null && (
        <FreeRamModal
          memMb={memMb}
          instanceCount={ideInstanceCount}
          onConfirm={handleKillAllIde}
          onCancel={() => setShowFreeRamModal(false)}
        />
      )}

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
