import { openPath } from "@tauri-apps/plugin-opener";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { projectInitials } from "../lib/constants";
import type { Project } from "../lib/types";
import { ColorPicker } from "./ColorPicker";
import { ContextMenu } from "./ContextMenu";
import { PaletteIcon, PencilIcon, ProjectsIcon, TrashIcon } from "./Icons";

interface ProjectRowProps {
  project: Project;
  active: boolean;
  status?: "busy" | "waiting";
  needsAttention?: "ready" | "waiting";
  rowRef?: React.Ref<HTMLDivElement>;
  dragScope?: string;
  onSelect: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onRemove: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  isDragging: boolean;
  showInsertBefore: boolean;
}

export function ProjectRow({
  project,
  active,
  status,
  needsAttention,
  rowRef,
  dragScope = "projects",
  onSelect,
  onRename,
  onRecolor,
  onRemove,
  onPointerDown,
  isDragging,
  showInsertBefore,
}: ProjectRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorSwatchRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commitRename() {
    const next = draft.trim();
    if (next && next !== project.name) onRename(next);
    else setDraft(project.name);
    setEditing(false);
  }

  return (
    <div
      ref={rowRef}
      data-drag-scope={dragScope}
      data-drag-id={project.id}
      onPointerDown={onPointerDown}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("antani:close-ctx-menus"));
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      title={project.path}
      className={`relative flex cursor-pointer items-center gap-2.5 border-b border-l-[3px] border-sidebar-border px-3 py-2.5 no-select transition-colors ${
        active
          ? "text-white"
          : "border-l-transparent text-white/75 hover:bg-sidebar-accent/60 hover:text-white"
      } ${isDragging ? "opacity-30" : ""} ${
        needsAttention ? `needs-attention-glow-${needsAttention}` : ""
      }`}
      style={
        active
          ? { borderLeftColor: project.color, backgroundColor: `${project.color}26` }
          : undefined
      }
    >
      {showInsertBefore && (
        <div className="absolute top-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
      )}
      <span
        ref={colorSwatchRef}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-black/80"
        style={{ backgroundColor: project.color }}
      >
        {projectInitials(project.name)}
      </span>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(project.name);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded bg-tertiary px-1.5 py-0.5 text-sm outline-none ring-1 ring-border"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(project.name);
            setEditing(true);
          }}
          className="min-w-0 flex-1 truncate text-sm font-medium"
        >
          {project.name}
        </span>
      )}

      {status && !editing && (
        <span className="flex shrink-0 items-center justify-center">
          {status === "busy" ? (
            <span className="ai-busy-dot shrink-0" title="Activity in progress" />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" title="Waiting for input" />
          )}
        </span>
      )}

      {pickerOpen && (
        <ColorPicker
          anchorEl={colorSwatchRef.current}
          selected={project.color}
          onPick={onRecolor}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: "Rename",
              icon: <PencilIcon size={13} />,
              onSelect: () => {
                setDraft(project.name);
                setEditing(true);
              },
            },
            {
              label: "Change color",
              icon: <PaletteIcon size={13} />,
              onSelect: () => setPickerOpen(true),
            },
            {
              label: "Open in Finder",
              icon: <ProjectsIcon size={13} />,
              onSelect: () => void openPath(project.path),
            },
            {
              label: "Remove project",
              icon: <TrashIcon size={13} />,
              destructive: true,
              separatorBefore: true,
              onSelect: onRemove,
            },
          ]}
        />
      )}
    </div>
  );
}
