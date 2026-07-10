import { useEffect, useRef, useState } from "react";
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

export function TabChip({ tab, active, onSelect, onClose, onRename, onRecolor }: TabChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.title);
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
    if (next && next !== tab.title) onRename(next);
    else setDraft(tab.title);
    setEditing(false);
  }

  return (
    <div
      onClick={onSelect}
      className={`group relative flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-1.5 text-xs no-select ${
        active
          ? "bg-accent text-foreground"
          : "bg-transparent text-muted-foreground hover:bg-secondary"
      }`}
      style={{ borderBottomColor: tab.color ?? (active ? "#d4622a" : "transparent") }}
    >
      <button
        type="button"
        aria-label="Change tab color"
        onClick={(e) => {
          e.stopPropagation();
          setPickerOpen((v) => !v);
        }}
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-border"
        style={{ backgroundColor: tab.color ?? "transparent" }}
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

      <button
        type="button"
        aria-label="Close tab"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100"
      >
        ×
      </button>

      {pickerOpen && (
        <ColorPicker
          selected={tab.color ?? ""}
          onPick={onRecolor}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
