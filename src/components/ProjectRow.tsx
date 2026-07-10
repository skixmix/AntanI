import { useEffect, useRef, useState } from "react";
import type { Project } from "../lib/types";
import { ColorPicker } from "./ColorPicker";

interface ProjectRowProps {
  project: Project;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
}

export function ProjectRow({
  project,
  active,
  onSelect,
  onRename,
  onRecolor,
  onRemove,
  onDragStart,
  onDragEnter,
  onDrop,
  isDragging,
  isDropTarget,
}: ProjectRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      draggable={!editing}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      title={project.path}
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 no-select ${
        active ? "bg-white/10" : "hover:bg-white/5"
      } ${isDragging ? "opacity-40" : ""} ${isDropTarget ? "ring-1 ring-white/40" : ""}`}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-black/80"
        style={{ backgroundColor: project.color }}
      >
        {project.name.charAt(0).toUpperCase()}
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
          className="min-w-0 flex-1 rounded bg-black/40 px-1.5 py-0.5 text-sm outline-none ring-1 ring-white/20"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(project.name);
            setEditing(true);
          }}
          className="min-w-0 flex-1 truncate text-sm text-neutral-200"
        >
          {project.name}
        </span>
      )}

      {/* Status dot placeholder (wired up in Phase 4). */}
      <span className="h-2 w-2 shrink-0 rounded-full bg-transparent" aria-hidden />

      {!editing && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
          <button
            type="button"
            aria-label="Change color"
            onClick={(e) => {
              e.stopPropagation();
              setPickerOpen((v) => !v);
            }}
            className="h-4 w-4 rounded-full ring-1 ring-white/30"
            style={{ backgroundColor: project.color }}
          />
          <button
            type="button"
            aria-label="Remove project"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {pickerOpen && (
        <ColorPicker
          selected={project.color}
          onPick={onRecolor}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
