import { openPath } from "@tauri-apps/plugin-opener";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { projectInitials } from "../lib/constants";
import { fileDrag } from "../lib/fileDrag";
import type { Project } from "../lib/types";
import { useDragReorder } from "../lib/useDragReorder";
import { ContextMenu } from "./ContextMenu";
import { ChevronRightIcon, ProjectsIcon, WrenchIcon } from "./Icons";
import { ProjectRow } from "./ProjectRow";

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  projectsWithActivity: Set<string>;
  projectStatuses: Record<string, "busy" | "waiting">;
  projectNeedsAttention: Record<string, "ready" | "waiting">;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onOpenSettings: () => void;
}

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 260;
const COLLAPSED_WIDTH = 56;
const LS_KEY = "sidebar-width";
const LS_COLLAPSED_KEY = "sidebar-collapsed";

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

function readPersistedCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar({
  projects,
  activeProjectId,
  projectsWithActivity,
  projectStatuses,
  projectNeedsAttention,
  onAdd,
  onSelect,
  onRename,
  onRecolor,
  onRemove,
  onReorder,
  onOpenSettings,
}: SidebarProps) {
  const activeProjects = useMemo(
    () => projects.filter((p) => projectsWithActivity.has(p.id)),
    [projects, projectsWithActivity],
  );
  const inactiveProjects = useMemo(
    () => projects.filter((p) => !projectsWithActivity.has(p.id)),
    [projects, projectsWithActivity],
  );
  const hasSections = activeProjects.length > 0;

  const [activeProjectOrder, setActiveProjectOrder] = useState<string[]>(() =>
    activeProjects.map((p) => p.id),
  );

  const activeProjectIds = useMemo(() => activeProjects.map((p) => p.id), [activeProjects]);

  useEffect(() => {
    setActiveProjectOrder((prev) => {
      const incoming = new Set(activeProjectIds);
      const kept = prev.filter((id) => incoming.has(id));
      const added = activeProjectIds.filter((id) => !prev.includes(id));
      return [...kept, ...added];
    });
  }, [activeProjectIds]);

  const orderedActiveProjects = activeProjectOrder
    .map((id) => activeProjects.find((p) => p.id === id))
    .filter((p): p is (typeof activeProjects)[number] => p !== undefined);

  const { draggingId, insertBeforeId, startDrag } = useDragReorder(
    "projects",
    true,
    (fromId, insertBefore) => {
      const inactiveIds = inactiveProjects.map((p) => p.id);
      const reordered = inactiveIds.filter((id) => id !== fromId);
      if (insertBefore === null) {
        reordered.push(fromId);
      } else {
        const idx = reordered.indexOf(insertBefore);
        if (idx !== -1) reordered.splice(idx, 0, fromId);
        else reordered.push(fromId);
      }
      // Slot the reordered inactive ids back into the positions they already
      // occupy, leaving active projects put. Appending active ids at the end
      // (the old behavior) yanked them to the bottom once their tabs closed.
      const inactiveSet = new Set(inactiveIds);
      let cursor = 0;
      const merged = projects.map((p) => (inactiveSet.has(p.id) ? reordered[cursor++] : p.id));
      onReorder(merged);
    },
  );

  const {
    draggingId: activeDraggingId,
    insertBeforeId: activeInsertBeforeId,
    startDrag: startActiveDrag,
  } = useDragReorder("projects-active", true, (fromId, insertBefore) => {
    setActiveProjectOrder((prev) => {
      const filtered = prev.filter((id) => id !== fromId);
      if (insertBefore === null) {
        filtered.push(fromId);
      } else {
        const idx = filtered.indexOf(insertBefore);
        if (idx !== -1) filtered.splice(idx, 0, fromId);
      }
      return filtered;
    });
  });
  function withPathDrag(project: Project, reorderStart: (e: React.PointerEvent) => void) {
    return (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fileDrag.path = project.path;

      const ghost = document.createElement("div");
      ghost.textContent = project.name;
      ghost.style.cssText = [
        "position:fixed",
        "pointer-events:none",
        "z-index:9999",
        "padding:3px 8px",
        "border-radius:4px",
        "font-size:11px",
        "font-family:Menlo,monospace",
        "white-space:nowrap",
        "background:rgba(40,42,54,0.95)",
        "border:1px solid rgba(255,255,255,0.12)",
        "color:rgba(255,255,255,0.85)",
        "box-shadow:0 2px 8px rgba(0,0,0,0.4)",
      ].join(";");
      ghost.style.left = `${e.clientX + 14}px`;
      ghost.style.top = `${e.clientY + 6}px`;
      document.body.appendChild(ghost);

      function onMove(ev: PointerEvent) {
        ghost.style.left = `${ev.clientX + 14}px`;
        ghost.style.top = `${ev.clientY + 6}px`;
      }
      function onUp() {
        fileDrag.path = null;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        ghost.remove();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);

      reorderStart(e);
    };
  }

  const [width, setWidth] = useState(readPersistedWidth);
  const [collapsed, setCollapsed] = useState(readPersistedCollapsed);
  const [activeSectionOpen, setActiveSectionOpen] = useState(false);
  const [inactiveSectionOpen, setInactiveSectionOpen] = useState(true);
  const [collapsedCtxMenu, setCollapsedCtxMenu] = useState<{
    project: Project;
    x: number;
    y: number;
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [accentLineHeight, setAccentLineHeight] = useState(0);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);
  const sidebarRef = useRef<HTMLElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);
  const activeCollapsedRowRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevHasSectionsRef = useRef(hasSections);

  useEffect(() => {
    if (!prevHasSectionsRef.current && hasSections) {
      setActiveSectionOpen(true);
    }
    prevHasSectionsRef.current = hasSections;
  }, [hasSections]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, String(width));
    } catch {}
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : width;

  // Exposed as a CSS var so the bottom status bar can mirror this width to
  // keep its centered content in sync as this sidebar is resized.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${effectiveWidth}px`);
  }, [effectiveWidth]);

  // Measure the accent line height: top of sidebar → bottom of active row.
  // Same measurement whether expanded (active row) or collapsed (active
  // project's icon button), so the accent always reaches the active project.
  useLayoutEffect(() => {
    function measure() {
      const sidebar = sidebarRef.current;
      const row = collapsed ? activeCollapsedRowRef.current : activeRowRef.current;
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
      setIsResizing(true);
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
        setIsResizing(false);
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
        width: effectiveWidth,
        background: "var(--color-sidebar)",
        borderRight: "1px solid var(--color-panel-divider)",
        transition: isResizing ? undefined : "width 180ms ease",
      }}
    >
      {/* Active-project accent: an L-shaped line from the top down to the
          active row/icon, whether expanded or collapsed. */}
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
        className={`flex shrink-0 items-center justify-center text-xs font-semibold uppercase tracking-widest text-white/40 no-select ${
          collapsed ? "" : "gap-1.5"
        }`}
        style={{ height: 53, borderBottom: "1px solid var(--color-sidebar-border)" }}
      >
        <ProjectsIcon size={13} className="shrink-0" />
        {!collapsed && "Projects"}
      </div>

      {/* Collapse toggle — anchored to the sidebar's outer edge so it stays
          in the same spot whether expanded or collapsed, instead of
          competing for space in the (very narrow, when collapsed) header. */}
      <button
        type="button"
        title={collapsed ? "Expand projects panel" : "Collapse projects panel"}
        onClick={() => setCollapsed((c) => !c)}
        className="absolute z-30 flex h-6 w-6 items-center justify-center rounded-full border bg-sidebar text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        style={{
          right: -12,
          top: 20,
          borderColor: activeProject?.color ?? "var(--color-sidebar-border)",
        }}
      >
        <ChevronRightIcon size={11} className={collapsed ? "" : "rotate-180"} />
      </button>

      {/* Project list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {collapsed ? (
          <>
            {(hasSections ? orderedActiveProjects : projects).map((project) => (
              <button
                key={project.id}
                ref={project.id === activeProjectId ? activeCollapsedRowRef : undefined}
                type="button"
                title={project.name}
                onClick={() => onSelect(project.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCollapsedCtxMenu({ project, x: e.clientX, y: e.clientY });
                }}
                className={`relative flex w-full items-center justify-center py-2 no-select ${
                  projectNeedsAttention[project.id]
                    ? `needs-attention-glow-${projectNeedsAttention[project.id]}`
                    : ""
                }`}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-black/80"
                  style={{
                    backgroundColor: project.color,
                    boxShadow:
                      project.id === activeProjectId
                        ? "0 0 0 2px var(--color-foreground)"
                        : undefined,
                  }}
                >
                  {projectInitials(project.name)}
                </span>
                {projectStatuses[project.id] && (
                  <span className="absolute right-2.5 top-1 flex items-center justify-center">
                    {projectStatuses[project.id] === "busy" ? (
                      <span className="ai-busy-dot shrink-0" title="Activity in progress" />
                    ) : (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-red-400"
                        title="Waiting for input"
                      />
                    )}
                  </span>
                )}
              </button>
            ))}
            {hasSections && (
              <>
                <div
                  className="mx-auto my-1"
                  style={{
                    width: 28,
                    height: 1,
                    background: "var(--color-sidebar-border)",
                  }}
                />
                {inactiveProjects.map((project) => (
                  <button
                    key={project.id}
                    ref={project.id === activeProjectId ? activeCollapsedRowRef : undefined}
                    type="button"
                    title={project.name}
                    onClick={() => onSelect(project.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCollapsedCtxMenu({ project, x: e.clientX, y: e.clientY });
                    }}
                    className={`relative flex w-full items-center justify-center py-2 no-select ${
                      projectNeedsAttention[project.id]
                        ? `needs-attention-glow-${projectNeedsAttention[project.id]}`
                        : ""
                    }`}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-black/80"
                      style={{
                        backgroundColor: project.color,
                        opacity: 0.5,
                        boxShadow:
                          project.id === activeProjectId
                            ? "0 0 0 2px var(--color-foreground)"
                            : undefined,
                      }}
                    >
                      {projectInitials(project.name)}
                    </span>
                    {projectStatuses[project.id] && (
                      <span className="absolute right-2.5 top-1 flex items-center justify-center">
                        {projectStatuses[project.id] === "busy" ? (
                          <span className="ai-busy-dot shrink-0" title="Activity in progress" />
                        ) : (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-red-400"
                            title="Waiting for input"
                          />
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </>
            )}
          </>
        ) : projects.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-xs leading-relaxed text-muted-foreground no-select">
            <span>No projects yet.</span>
            <button
              type="button"
              onClick={onAdd}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-sidebar-accent transition-colors"
            >
              Add project
            </button>
          </div>
        ) : hasSections ? (
          <>
            <button
              type="button"
              onClick={() => setActiveSectionOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30 hover:text-white/50 transition-colors no-select"
              style={{ borderBottom: "1px solid var(--color-sidebar-border)" }}
            >
              <ChevronRightIcon
                size={9}
                className={`shrink-0 transition-transform ${activeSectionOpen ? "rotate-90" : ""}`}
              />
              Active
            </button>
            {activeSectionOpen && (
              <>
                {orderedActiveProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    dragScope="projects-active"
                    project={project}
                    active={project.id === activeProjectId}
                    status={projectStatuses[project.id]}
                    needsAttention={projectNeedsAttention[project.id]}
                    rowRef={project.id === activeProjectId ? activeRowRef : undefined}
                    onSelect={() => onSelect(project.id)}
                    onRename={(name) => onRename(project.id, name)}
                    onRecolor={(color) => onRecolor(project.id, color)}
                    onRemove={() => onRemove(project.id)}
                    onPointerDown={withPathDrag(project, (e) => startActiveDrag(e, project.id))}
                    isDragging={activeDraggingId === project.id}
                    showInsertBefore={
                      activeInsertBeforeId === project.id && activeDraggingId !== project.id
                    }
                  />
                ))}
                {activeDraggingId && activeInsertBeforeId === null && (
                  <div className="mx-2 h-0.5 rounded-full bg-primary my-0.5" />
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setInactiveSectionOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30 hover:text-white/50 transition-colors no-select"
              style={{ borderBottom: "1px solid var(--color-sidebar-border)" }}
            >
              <ChevronRightIcon
                size={9}
                className={`shrink-0 transition-transform ${inactiveSectionOpen ? "rotate-90" : ""}`}
              />
              Inactive
            </button>
            {inactiveSectionOpen &&
              inactiveProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  active={project.id === activeProjectId}
                  status={projectStatuses[project.id]}
                  needsAttention={projectNeedsAttention[project.id]}
                  rowRef={project.id === activeProjectId ? activeRowRef : undefined}
                  onSelect={() => onSelect(project.id)}
                  onRename={(name) => onRename(project.id, name)}
                  onRecolor={(color) => onRecolor(project.id, color)}
                  onRemove={() => onRemove(project.id)}
                  onPointerDown={withPathDrag(project, (e) => startDrag(e, project.id))}
                  isDragging={draggingId === project.id}
                  showInsertBefore={insertBeforeId === project.id && draggingId !== project.id}
                />
              ))}
            {draggingId && insertBeforeId === null && (
              <div className="mx-2 h-0.5 rounded-full bg-primary my-0.5" />
            )}
          </>
        ) : (
          <>
            {projects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                active={project.id === activeProjectId}
                status={projectStatuses[project.id]}
                needsAttention={projectNeedsAttention[project.id]}
                rowRef={project.id === activeProjectId ? activeRowRef : undefined}
                onSelect={() => onSelect(project.id)}
                onRename={(name) => onRename(project.id, name)}
                onRecolor={(color) => onRecolor(project.id, color)}
                onRemove={() => onRemove(project.id)}
                onPointerDown={withPathDrag(project, (e) => startDrag(e, project.id))}
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

      {collapsedCtxMenu && (
        <ContextMenu
          x={collapsedCtxMenu.x}
          y={collapsedCtxMenu.y}
          onClose={() => setCollapsedCtxMenu(null)}
          items={[
            {
              label: "Open in Finder",
              icon: <ProjectsIcon size={13} />,
              onSelect: () => void openPath(collapsedCtxMenu.project.path),
            },
          ]}
        />
      )}

      {/* Footer — pinned at bottom */}
      <div style={{ borderTop: "1px solid var(--color-sidebar-border)" }}>
        <button
          type="button"
          onClick={onAdd}
          title="Add project"
          className={`flex w-full items-center text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors no-select ${
            collapsed ? "justify-center py-3" : "gap-2.5 px-3 py-3.5"
          }`}
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
          {!collapsed && "Add project"}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className={`flex w-full items-center text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors no-select ${
            collapsed ? "justify-center py-2.5" : "gap-2.5 px-3 py-2.5"
          }`}
          style={{ borderTop: "1px solid var(--color-sidebar-border)" }}
        >
          <WrenchIcon size={13} className="shrink-0 opacity-60" />
          {!collapsed && "Settings"}
        </button>
      </div>

      {/* Resize handle */}
      {!collapsed && (
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10"
          onMouseDown={onResizeStart}
        />
      )}
    </aside>
  );
}
