import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../lib/types";
import { ProjectRow } from "./ProjectRow";

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 240;
const LS_KEY = "sidebar-width";

function readPersistedWidth(): number {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch {}
  return DEFAULT_WIDTH;
}

export function Sidebar({
  projects,
  activeProjectId,
  onAdd,
  onSelect,
  onRename,
  onRecolor,
  onRemove,
  onReorder,
}: SidebarProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [width, setWidth] = useState(readPersistedWidth);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, String(width)); } catch {}
  }, [width]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;

    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWRef.current + ev.clientX - startXRef.current));
      setWidth(next);
    }
    function onUp() {
      resizingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [width]);

  function handleDrop() {
    if (draggingId && dropTargetId && draggingId !== dropTargetId) {
      const ids = projects.map((p) => p.id);
      const from = ids.indexOf(draggingId);
      const to = ids.indexOf(dropTargetId);
      if (from !== -1 && to !== -1) {
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        onReorder(ids);
      }
    }
    setDraggingId(null);
    setDropTargetId(null);
  }

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col"
      style={{ width, background: "var(--color-sidebar)", borderRight: "1px solid var(--color-sidebar-border)" }}
    >
      {/* Project list */}
      <div className="flex-1 overflow-y-auto" onDragEnd={handleDrop}>
        {projects.length === 0 ? (
          <div className="mt-8 px-4 text-center text-xs leading-relaxed text-muted-foreground no-select">
            No projects yet — click Add project below.
          </div>
        ) : (
          projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              active={project.id === activeProjectId}
              onSelect={() => onSelect(project.id)}
              onRename={(name) => onRename(project.id, name)}
              onRecolor={(color) => onRecolor(project.id, color)}
              onRemove={() => onRemove(project.id)}
              onDragStart={() => setDraggingId(project.id)}
              onDragEnter={() => setDropTargetId(project.id)}
              onDrop={handleDrop}
              isDragging={draggingId === project.id}
              isDropTarget={dropTargetId === project.id && draggingId !== project.id}
            />
          ))
        )}
      </div>

      {/* Add project — pinned at bottom */}
      <div style={{ borderTop: "1px solid var(--color-sidebar-border)" }}>
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center gap-2.5 px-3 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors no-select"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 opacity-60">
            <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Add project
        </button>
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10"
        onMouseDown={onResizeStart}
      />
    </aside>
  );
}
