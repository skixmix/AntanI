import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { Tab, TabStatus } from "../lib/tabs";
import { ColorPicker } from "./ColorPicker";
import { AnthropicIcon, OpenCodeIcon, TerminalIcon, VSCodeIcon } from "./Icons";

interface TabChipProps {
  tab: Tab;
  active: boolean;
  status?: TabStatus;
  needsAttention?: boolean;
  isDragging?: boolean;
  showInsertBefore?: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (title: string) => void;
  onRecolor: (color: string) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}

const KIND_ICON: Record<string, ReactNode> = {
  terminal: <TerminalIcon size={12} className="opacity-70" />,
  opencode: <OpenCodeIcon size={12} className="opacity-80" />,
  claude: <AnthropicIcon size={12} className="text-[#d4622a]" />,
  ide: <VSCodeIcon size={12} className="text-[#007ACC] opacity-80" />,
};

function AiStatusDot({ status }: { status: TabStatus }) {
  if (status === "busy") return <span className="ai-busy-dot shrink-0" title="Working" />;
  if (status === "ready")
    return <span className="h-2 w-2 shrink-0 rounded-full bg-green-400" title="Ready" />;
  if (status === "waiting")
    return <span className="h-2 w-2 shrink-0 rounded-full bg-red-400" title="Waiting for input" />;
  return null;
}

export function TabChip({
  tab,
  active,
  status,
  needsAttention,
  isDragging,
  showInsertBefore,
  onSelect,
  onClose,
  onRename,
  onRecolor,
  onPointerDown,
}: TabChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.title);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);

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
    if (next && next !== tab.title) onRename(next);
    else setDraft(tab.title);
    setEditing(false);
  }

  const accentColor = tab.color ?? (active ? "#d4622a" : undefined);

  return (
    <div
      ref={chipRef}
      data-drag-scope="tabs"
      data-drag-id={tab.id}
      onClick={onSelect}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`group relative flex h-full shrink-0 items-center gap-2 border-b-2 border-r border-r-border px-3 text-sm no-select cursor-pointer transition-opacity ${
        active
          ? "bg-accent text-foreground"
          : "bg-transparent text-muted-foreground hover:bg-secondary"
      } ${isDragging ? "opacity-30 scale-95" : ""} ${
        needsAttention
          ? status === "ready"
            ? "needs-attention-glow-ready"
            : "needs-attention-glow-waiting"
          : ""
      }`}
      style={{ borderBottomColor: accentColor ?? "transparent" }}
    >
      {showInsertBefore && (
        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" />
      )}
      <span className="shrink-0 flex items-center">{KIND_ICON[tab.kind] ?? null}</span>

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
              setDraft(tab.title);
              setEditing(false);
            }
          }}
          className="w-24 min-w-0 rounded bg-tertiary px-1 py-0.5 outline-none ring-1 ring-border"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(tab.title);
            setEditing(true);
          }}
          className="max-w-40 truncate"
        >
          {tab.title}
        </span>
      )}

      {/* Right slot: status indicator that becomes × on hover */}
      <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        {status && status !== "idle" && (
          <span className="flex items-center justify-center transition-opacity group-hover:opacity-0">
            <AiStatusDot status={status} />
          </span>
        )}
        <button
          type="button"
          aria-label="Close tab"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute inset-0 flex items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
        >
          ×
        </button>
      </div>

      {pickerOpen && (
        <ColorPicker
          anchorEl={chipRef.current}
          selected={tab.color ?? ""}
          onPick={onRecolor}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {ctxMenu && (
        <div
          className="fixed z-50 min-w-36 rounded-lg border border-border bg-popover p-1 shadow-xl text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground hover:bg-secondary"
            onClick={() => {
              setDraft(tab.title);
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
              onClose();
              setCtxMenu(null);
            }}
          >
            Close tab
          </button>
        </div>
      )}
    </div>
  );
}
