import { useEffect, useRef, useState } from "react";
import { isAgentKind, type Tab, type TabStatus } from "../lib/tabs";
import { ColorPicker } from "./ColorPicker";
import { ConfirmPopover } from "./ConfirmPopover";
import { TerminalIcon } from "./Icons";
import { AiStatusDot, KIND_ICON } from "./TabChip";

interface PaneHeaderProps {
  tab: Tab;
  focused: boolean;
  status?: TabStatus;
  running?: boolean;
  dragging?: boolean;
  onHeaderPointerDown: (e: React.PointerEvent) => void;
  onClose: () => void;
  onRename: (title: string) => void;
  onRecolor: (color: string) => void;
}

export function PaneHeader({
  tab,
  focused,
  status,
  running,
  dragging,
  onHeaderPointerDown,
  onClose,
  onRename,
  onRecolor,
}: PaneHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.title);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [closeConfirm, setCloseConfirm] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const isAiRunning = isAgentKind(tab.kind) && (status === "busy" || status === "waiting");
  const isTerminalRunning = tab.kind === "terminal" && !!running;

  function requestClose(x: number, y: number) {
    if (isAiRunning || isTerminalRunning) setCloseConfirm({ x, y });
    else onClose();
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!ctxMenu) return;
    window.dispatchEvent(new CustomEvent("antani:picker-open"));
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("antani:close-ctx-menus", close);
    return () => {
      window.dispatchEvent(new CustomEvent("antani:picker-close"));
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("antani:close-ctx-menus", close);
    };
  }, [ctxMenu]);

  function commitRename() {
    const next = draft.trim();
    if (next && next !== tab.title) onRename(next);
    else setDraft(tab.title);
    setEditing(false);
  }

  return (
    <div
      ref={headerRef}
      onPointerDown={onHeaderPointerDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("antani:close-ctx-menus"));
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`flex h-full items-center gap-2 px-2 text-xs no-select cursor-grab border-b border-border ${
        focused
          ? "bg-accent text-foreground"
          : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
      } ${dragging ? "opacity-50" : ""}`}
    >
      <span className="flex shrink-0 items-center">
        {tab.kind === "terminal" ? (
          <TerminalIcon size={12} className="opacity-70" blink={running} />
        ) : (
          (KIND_ICON[tab.kind] ?? null)
        )}
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
              setDraft(tab.title);
              setEditing(false);
            }
          }}
          className="w-32 min-w-0 rounded bg-tertiary px-1 py-0.5 outline-none ring-1 ring-border"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(tab.title);
            setEditing(true);
          }}
          className="min-w-0 truncate"
        >
          {tab.title}
        </span>
      )}

      {status && status !== "idle" && <AiStatusDot status={status} />}

      <button
        type="button"
        aria-label="Close pane"
        onClick={(e) => {
          e.stopPropagation();
          requestClose(e.clientX, e.clientY);
        }}
        className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        ×
      </button>

      {pickerOpen && (
        <ColorPicker
          anchorEl={headerRef.current}
          selected={tab.color ?? ""}
          onPick={onRecolor}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {closeConfirm && (
        <ConfirmPopover
          x={closeConfirm.x}
          y={closeConfirm.y}
          message={
            <>
              <span className="font-medium">{tab.title}</span> is still running. Close it anyway?
            </>
          }
          confirmLabel="Close tab"
          onConfirm={() => {
            setCloseConfirm(null);
            onClose();
          }}
          onCancel={() => setCloseConfirm(null)}
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
              const anchor = ctxMenu;
              setCtxMenu(null);
              if (anchor) requestClose(anchor.x, anchor.y);
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
