import { useCallback, useEffect, useRef, useState } from "react";
import { FreeRamModal } from "./components/FreeRamModal";
import { ImportVscodeModal } from "./components/ImportVscodeModal";
import { Sidebar } from "./components/Sidebar";
import { Workspace } from "./components/Workspace";
import * as api from "./lib/api";
import { basename, defaultColorForIndex, MAX_QUICK_SWITCH } from "./lib/constants";
import {
  addTab,
  closeTab,
  createTab,
  recolorTab,
  removeProjectTabs,
  renameTab,
  reorderTabs,
  setActiveTab,
  type TabKind,
  type TabStatus,
  type TabsState,
} from "./lib/tabs";
import type { AppData, Settings } from "./lib/types";

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
  const [ideOpenByProject, setIdeOpenByProject] = useState<Record<string, boolean>>({});
  const [ideEverOpenedByProject, setIdeEverOpenedByProject] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [showFreeRamModal, setShowFreeRamModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const { memMb, refreshMem } = useVscodeMemory();

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

  const activeId = data?.activeProjectId ?? null;

  const openTab = useCallback(
    (kind: TabKind) => {
      if (!activeId || !settings) return;
      setTabs((t) => addTab(t, activeId, createTab(kind, settings)));
      setIdeOpenByProject((prev) => ({ ...prev, [activeId]: false }));
    },
    [activeId, settings],
  );

  const selectTab = useCallback(
    (tabId: string) => {
      if (!activeId) return;
      setTabs((t) => setActiveTab(t, activeId, tabId));
      setIdeOpenByProject((prev) => ({ ...prev, [activeId]: false }));
    },
    [activeId],
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
    },
    [activeId],
  );

  const handleStatusChange = useCallback((tabId: string, status: TabStatus) => {
    setTabStatuses((s) => (s[tabId] === status ? s : { ...s, [tabId]: status }));
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

  const handleToggleIde = useCallback(() => {
    if (!activeId) return;
    const isOpen = ideOpenByProject[activeId] ?? false;
    if (isOpen) {
      setIdeOpenByProject((prev) => ({ ...prev, [activeId]: false }));
      setIdeEverOpenedByProject((prev) => ({ ...prev, [activeId]: false }));
    } else {
      setIdeEverOpenedByProject((prev) => ({ ...prev, [activeId]: true }));
      setIdeOpenByProject((prev) => ({ ...prev, [activeId]: true }));
    }
    // Refresh mem immediately after toggle
    void refreshMem();
  }, [activeId, ideOpenByProject, refreshMem]);

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

  if (!data || !settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {error ? <span className="text-destructive">{error}</span> : "Loading…"}
      </div>
    );
  }

  const active = data.projects.find((p) => p.id === data.activeProjectId) ?? null;
  const ideOpen = activeId ? (ideOpenByProject[activeId] ?? false) : false;
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
          onAdd={handleAdd}
          onSelect={(id) => run(() => api.setActiveProject(id))}
          onRename={(id, name) => run(() => api.renameProject(id, name))}
          onRecolor={(id, color) => run(() => api.setProjectColor(id, color))}
          onRemove={handleRemove}
          onReorder={(ids) => run(() => api.reorderProjects(ids))}
          showFreeRamButton={showFreeRamButton}
          onFreeRam={() => setShowFreeRamModal(true)}
          onImportVscode={() => setShowImportModal(true)}
        />
        <Workspace
          project={active}
          projects={data.projects}
          tabs={tabs}
          tabStatuses={tabStatuses}
          ideOpen={ideOpen}
          ideEverOpenedByProject={ideEverOpenedByProject}
          ideInstanceCount={ideInstanceCount}
          memMb={memMb}
          onOpenTab={openTab}
          onSelectTab={selectTab}
          onCloseTab={handleCloseTab}
          onRenameTab={handleRenameTab}
          onRecolorTab={handleRecolorTab}
          onReorderTab={handleReorderTab}
          onToggleIde={handleToggleIde}
          onStatusChange={handleStatusChange}
        />
      </div>

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
