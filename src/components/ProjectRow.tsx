import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../lib/types";
import { ColorPicker } from "./ColorPicker";

interface ProjectRowProps {
  project: Project;
  active: boolean;
  status?: "busy" | "waiting";
  rowRef?: React.Ref<HTMLDivElement>;
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
  rowRef,
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

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [ctxMenu]);

  function commitRename() {
    const next = draft.trim();
    if (next && next !== project.name) onRename(next);
    else setDraft(project.name);
    setEditing(false);
  }

  return (
    <div
      ref={rowRef}
      data-drag-scope="projects"
      data-drag-id={project.id}
      onPointerDown={onPointerDown}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      title={project.path}
      className={`relative flex cursor-pointer items-center gap-2.5 px-3 py-2.5 no-select transition-opacity border-b border-sidebar-border ${
        active
          ? "bg-sidebar-accent text-white"
          : "text-white/75 hover:bg-sidebar-accent/60 hover:text-white"
      } ${isDragging ? "opacity-30" : ""}`}
    >
      {showInsertBefore && (
        <div className="absolute top-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
      )}
      <span
        ref={colorSwatchRef}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-black/80"
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

      {ctxMenu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
            <div
              className="fixed z-50 min-w-36 rounded-lg border border-border bg-popover p-1 shadow-xl text-sm"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground hover:bg-secondary"
                onClick={() => {
                  setDraft(project.name);
                  setEditing(true);
                  setCtxMenu(null);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground hover:bg-secondary"
                onClick={() => {
                  setPickerOpen(true);
                  setCtxMenu(null);
                }}
              >
                Change color
              </button>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-secondary"
                onClick={() => {
                  onRemove();
                  setCtxMenu(null);
                }}
              >
                Remove project
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
