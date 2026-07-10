import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Tab } from "../lib/tabs";
import { ColorPicker } from "./ColorPicker";

interface TabChipProps {
  tab: Tab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (title: string) => void;
  onRecolor: (color: string) => void;
}

const KIND_ICON: Record<string, ReactNode> = {
  terminal: <span className="font-mono text-[11px] opacity-70">&gt;_</span>,
  opencode: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="opacity-70">
      <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8l2.5-2.5L10 8l-2.5 2.5L5 8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  claude: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1 L9.2 5.5 L13.5 4 L11 8 L13.5 12 L9.2 10.5 L8 15 L6.8 10.5 L2.5 12 L5 8 L2.5 4 L6.8 5.5 Z" fill="#d4622a" />
    </svg>
  ),
  ide: <span className="font-mono text-[10px] opacity-70">&lt;/&gt;</span>,
};

export function TabChip({ tab, active, onSelect, onClose, onRename, onRecolor }: TabChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.title);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorDotRef = useRef<HTMLSpanElement>(null);

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
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`group relative flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-2.5 py-1.5 text-xs no-select cursor-pointer ${
        active
          ? "bg-accent text-foreground"
          : "bg-transparent text-muted-foreground hover:bg-secondary"
      }`}
      style={{ borderBottomColor: accentColor ?? "transparent" }}
    >
      <span className="shrink-0 flex items-center">{KIND_ICON[tab.kind] ?? null}</span>

      <span
        ref={colorDotRef}
        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20 cursor-pointer hover:scale-125 transition-transform"
        style={{ backgroundColor: tab.color ?? (active ? "#d4622a" : "#555") }}
        title="Change color"
        onClick={(e) => {
          e.stopPropagation();
          setPickerOpen((v) => !v);
        }}
      />

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setDraft(tab.title); setEditing(false); }
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

      <button
        type="button"
        aria-label="Close tab"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100"
      >
        ×
      </button>

      {pickerOpen && (
        <ColorPicker
          anchorEl={colorDotRef.current}
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
            onClick={() => { setDraft(tab.title); setEditing(true); setCtxMenu(null); }}
          >
            Rename
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground hover:bg-secondary"
            onClick={() => { setPickerOpen(true); setCtxMenu(null); }}
          >
            Change color
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-secondary"
            onClick={() => { onClose(); setCtxMenu(null); }}
          >
            Close tab
          </button>
        </div>
      )}
    </div>
  );
}
