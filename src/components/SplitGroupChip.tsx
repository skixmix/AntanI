import { useEffect, useRef, useState } from "react";
import type { Split, TabStatus } from "../lib/tabs";
import { ColorPicker } from "./ColorPicker";
import { SplitColumnsIcon } from "./Icons";
import { AiStatusDot } from "./TabChip";

interface SplitGroupChipProps {
  split: Split;
  viewingSplit: boolean;
  primaryStatus?: TabStatus;
  secondaryStatus?: TabStatus;
  primaryRunning?: boolean;
  secondaryRunning?: boolean;
  needsAttention?: boolean;
  onView: () => void;
  onRename: (title: string) => void;
  onRecolor: (color: string) => void;
  onClose: () => void;
}

const DEFAULT_ACCENT = "#d4622a";

export function SplitGroupChip({
  split,
  viewingSplit,
  primaryStatus,
  secondaryStatus,
  needsAttention,
  onView,
  onRename,
  onRecolor,
  onClose,
}: SplitGroupChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(split.title);
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
    if (next && next !== split.title) onRename(next);
    else setDraft(split.title);
    setEditing(false);
  }

  const glowClass = needsAttention
    ? primaryStatus === "waiting" || secondaryStatus === "waiting"
      ? "needs-attention-glow-waiting"
      : "needs-attention-glow-ready"
    : "";
  const accentColor = viewingSplit
    ? (split.color ?? DEFAULT_ACCENT)
    : (split.color ?? "transparent");

  return (
    <div
      ref={chipRef}
      onClick={onView}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("antani:close-ctx-menus"));
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`group relative flex h-full shrink-0 items-center gap-2 border-b-2 border-r border-r-border px-3 text-sm no-select cursor-pointer transition-opacity ${
        viewingSplit
          ? "bg-accent text-foreground"
          : "bg-transparent text-muted-foreground hover:bg-secondary"
      } ${glowClass}`}
      style={{ borderBottomColor: accentColor }}
    >
      <span className="shrink-0 flex items-center text-muted-foreground" title="Split view">
        <SplitColumnsIcon size={13} />
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
              setDraft(split.title);
              setEditing(false);
            }
          }}
          className="w-24 min-w-0 rounded bg-tertiary px-1 py-0.5 outline-none ring-1 ring-border"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(split.title);
            setEditing(true);
          }}
          className="max-w-40 truncate"
        >
          {split.title}
        </span>
      )}

      <span className="flex shrink-0 items-center gap-1">
        {primaryStatus && primaryStatus !== "idle" && <AiStatusDot status={primaryStatus} />}
        {secondaryStatus && secondaryStatus !== "idle" && <AiStatusDot status={secondaryStatus} />}
      </span>

      <button
        type="button"
        aria-label="Close split view"
        title="Close split view"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
      >
        ×
      </button>

      {pickerOpen && (
        <ColorPicker
          anchorEl={chipRef.current}
          selected={split.color ?? ""}
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
              setDraft(split.title);
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
            Close split view
          </button>
        </div>
      )}
    </div>
  );
}
