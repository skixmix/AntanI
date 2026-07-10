import { useCallback, useEffect, useState } from "react";
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
  setActiveTab,
  type TabKind,
  type TabsState,
} from "./lib/tabs";
import type { AppData, Settings } from "./lib/types";

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tabs, setTabs] = useState<TabsState>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getAppState(), api.getSettings()])
      .then(([appData, appSettings]) => {
        setData(appData);
        setSettings(appSettings);
      })
      .catch((e) => setError(String(e)));
  }, []);

  /** Run a mutating command and adopt its returned state (drift-free). */
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
      if (activeId && settings) setTabs((t) => addTab(t, activeId, createTab(kind, settings)));
    },
    [activeId, settings],
  );
  const selectTab = useCallback(
    (tabId: string) => activeId && setTabs((t) => setActiveTab(t, activeId, tabId)),
    [activeId],
  );
  const handleCloseTab = useCallback(
    (tabId: string) => activeId && setTabs((t) => closeTab(t, activeId, tabId)),
    [activeId],
  );
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

  // Cmd+1..9 switches to the Nth project.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > MAX_QUICK_SWITCH) return;
      const project = data?.projects[n - 1];
      if (project) {
        e.preventDefault();
        void run(() => api.setActiveProject(project.id));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, run]);

  if (!data || !settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {error ? <span className="text-destructive">{error}</span> : "Loading…"}
      </div>
    );
  }

  const active = data.projects.find((p) => p.id === data.activeProjectId) ?? null;

  return (
    <div className="flex h-full w-full bg-background">
      <Sidebar
        projects={data.projects}
        activeProjectId={data.activeProjectId}
        onAdd={handleAdd}
        onSelect={(id) => run(() => api.setActiveProject(id))}
        onRename={(id, name) => run(() => api.renameProject(id, name))}
        onRecolor={(id, color) => run(() => api.setProjectColor(id, color))}
        onRemove={handleRemove}
        onReorder={(ids) => run(() => api.reorderProjects(ids))}
      />
      <Workspace
        project={active}
        projects={data.projects}
        tabs={tabs}
        onOpenTab={openTab}
        onSelectTab={selectTab}
        onCloseTab={handleCloseTab}
        onRenameTab={handleRenameTab}
        onRecolorTab={handleRecolorTab}
      />

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
