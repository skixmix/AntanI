import { useState } from "react";
import { APP_NAME } from "../lib/constants";
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
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <header className="flex items-center justify-between px-3 py-3 no-select">
        <span className="text-sm font-semibold tracking-wide text-foreground">{APP_NAME}</span>
        <button
          type="button"
          aria-label="Add project"
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-md text-lg leading-none text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          +
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {projects.length === 0 ? (
          <div className="mt-8 px-3 text-center text-xs leading-relaxed text-muted-foreground no-select">
            No projects yet.
            <br />
            Click <span className="text-foreground">+</span> to add a folder.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5" onDragEnd={handleDrop}>
            {projects.map((project) => (
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
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
