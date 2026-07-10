import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Workspace } from "./components/Workspace";
import * as api from "./lib/api";
import { basename, defaultColorForIndex, MAX_QUICK_SWITCH } from "./lib/constants";
import type { AppData } from "./lib/types";

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAppState()
      .then(setData)
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

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-600">
        {error ? <span className="text-red-400">{error}</span> : "Loading…"}
      </div>
    );
  }

  const active = data.projects.find((p) => p.id === data.activeProjectId) ?? null;

  return (
    <div className="flex h-full w-full">
      <Sidebar
        projects={data.projects}
        activeProjectId={data.activeProjectId}
        onAdd={handleAdd}
        onSelect={(id) => run(() => api.setActiveProject(id))}
        onRename={(id, name) => run(() => api.renameProject(id, name))}
        onRecolor={(id, color) => run(() => api.setProjectColor(id, color))}
        onRemove={(id) => run(() => api.removeProject(id))}
        onReorder={(ids) => run(() => api.reorderProjects(ids))}
      />
      <Workspace project={active} />

      {error && (
        <div className="fixed bottom-3 right-3 z-50 max-w-sm rounded-md border border-red-500/40 bg-red-950/80 px-3 py-2 text-xs text-red-200 shadow-lg">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 underline decoration-red-400/50 hover:text-white"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
