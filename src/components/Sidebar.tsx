import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Project } from "../lib/types";
import { useDragReorder } from "../lib/useDragReorder";
import { ProjectsIcon } from "./Icons";
import { ProjectRow } from "./ProjectRow";

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  projectStatuses: Record<string, "busy" | "waiting">;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  showFreeRamButton: boolean;
  onFreeRam: () => void;
  onImportVscode: () => void;
}

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 260;
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
  projectStatuses,
  onAdd,
  onSelect,
  onRename,
  onRecolor,
  onRemove,
  onReorder,
  showFreeRamButton,
  onFreeRam,
  onImportVscode,
}: SidebarProps) {
  const { draggingId, insertBeforeId, startDrag } = useDragReorder(
    "projects",
    true,
    (fromId, insertBefore) => {
      const ids = projects.map((p) => p.id);
      const filtered = ids.filter((id) => id !== fromId);
      if (insertBefore === null) {
        filtered.push(fromId);
      } else {
        const idx = filtered.indexOf(insertBefore);
        if (idx !== -1) filtered.splice(idx, 0, fromId);
      }
      onReorder(filtered);
    },
  );
  const [width, setWidth] = useState(readPersistedWidth);
  const [accentLineHeight, setAccentLineHeight] = useState(0);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);
  const sidebarRef = useRef<HTMLElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, String(width));
    } catch {}
  }, [width]);

  // Measure the accent line height: top of sidebar → bottom of active row
  useLayoutEffect(() => {
    function measure() {
      const sidebar = sidebarRef.current;
      const row = activeRowRef.current;
      if (!sidebar || !row) {
        setAccentLineHeight(0);
        return;
      }
      const sRect = sidebar.getBoundingClientRect();
      const rRect = row.getBoundingClientRect();
      setAccentLineHeight(Math.max(0, rRect.bottom - sRect.top));
    }
    measure();
  });

  // Also re-measure on list scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener("scroll", () => setAccentLineHeight(0)); // triggers re-layout
    return () => el.removeEventListener("scroll", () => {});
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      startXRef.current = e.clientX;
      startWRef.current = width;

      function onMove(ev: MouseEvent) {
        if (!resizingRef.current) return;
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWRef.current + ev.clientX - startXRef.current),
        );
        setWidth(next);
      }
      function onUp() {
        resizingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width],
  );

  return (
    <aside
      ref={sidebarRef}
      className="relative flex h-full shrink-0 flex-col"
      style={{
        width,
        background: "var(--color-sidebar)",
        borderRight: "1px solid var(--color-panel-divider)",
      }}
    >
      {/* L-shaped accent line: vertical strip on the right edge down to the active row */}
      {activeProject && accentLineHeight > 0 && (
        <div
          className="absolute right-0 top-0 z-20 pointer-events-none"
          style={{
            height: accentLineHeight,
            width: 2,
            backgroundColor: activeProject.color,
          }}
        />
      )}

      {/* Projects header — height matches the top tab row (color line + tab
          strip) in the center view, so the bottom border lines up there */}
      <div
        className="flex shrink-0 items-center gap-1.5 px-3 text-xs font-semibold uppercase tracking-widest text-white/40 no-select"
        style={{ height: 53, borderBottom: "1px solid var(--color-sidebar-border)" }}
      >
        <ProjectsIcon size={13} />
        Projects
      </div>

      {/* Project list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="mt-8 px-4 text-center text-xs leading-relaxed text-muted-foreground no-select">
            No projects yet — click Add project below.
          </div>
        ) : (
          <>
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                active={project.id === activeProjectId}
                status={projectStatuses[project.id]}
                rowRef={project.id === activeProjectId ? activeRowRef : undefined}
                onSelect={() => onSelect(project.id)}
                onRename={(name) => onRename(project.id, name)}
                onRecolor={(color) => onRecolor(project.id, color)}
                onRemove={() => onRemove(project.id)}
                onPointerDown={(e) => startDrag(e, project.id)}
                isDragging={draggingId === project.id}
                showInsertBefore={insertBeforeId === project.id && draggingId !== project.id}
              />
            ))}
            {draggingId && insertBeforeId === null && (
              <div className="mx-2 h-0.5 rounded-full bg-primary my-0.5" />
            )}
          </>
        )}
      </div>

      {/* Footer — pinned at bottom */}
      <div style={{ borderTop: "1px solid var(--color-sidebar-border)" }}>
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center gap-2.5 px-3 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors no-select"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="shrink-0 opacity-60"
          >
            <rect
              x="1.5"
              y="1.5"
              width="13"
              height="13"
              rx="2.5"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Add project
        </button>
        <button
          type="button"
          onClick={onImportVscode}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors no-select"
          style={{ borderTop: "1px solid var(--color-sidebar-border)" }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="shrink-0 opacity-60"
          >
            <path
              d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M8 2v8M5 7l3 3 3-3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Import settings from VS Code
        </button>
        {showFreeRamButton && (
          <button
            type="button"
            onClick={onFreeRam}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-red-400/80 hover:text-red-400 hover:bg-sidebar-accent transition-colors no-select"
            style={{ borderTop: "1px solid var(--color-sidebar-border)" }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                d="M8 2v5l3 3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M13.66 10A6 6 0 1 1 10 2.34"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            Free VS Code RAM
          </button>
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10"
        onMouseDown={onResizeStart}
      />
    </aside>
  );
}
