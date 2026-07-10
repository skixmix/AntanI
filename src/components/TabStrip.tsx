import { useState } from "react";
import type { Tab, TabKind } from "../lib/tabs";
import { TabChip } from "./TabChip";

interface TabStripProps {
  tabs: Tab[];
  activeTabId: string | null;
  onOpen: (kind: TabKind) => void;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onRename: (tabId: string, title: string) => void;
  onRecolor: (tabId: string, color: string) => void;
}

const NEW_TAB_ITEMS: { kind: TabKind; label: string; enabled: boolean }[] = [
  { kind: "terminal", label: "Terminal", enabled: true },
  { kind: "claude", label: "Claude", enabled: true },
  { kind: "opencode", label: "opencode", enabled: true },
  { kind: "ide", label: "IDE", enabled: false },
];

export function TabStrip({
  tabs,
  activeTabId,
  onOpen,
  onSelect,
  onClose,
  onRename,
  onRecolor,
}: TabStripProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-1 border-b border-border px-2 pt-1.5">
      <div className="flex flex-1 items-end gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <TabChip
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            onRename={(title) => onRename(tab.id, title)}
            onRecolor={(color) => onRecolor(tab.id, color)}
          />
        ))}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="New tab"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded text-lg text-muted-foreground hover:bg-secondary hover:text-primary"
        >
          +
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-50 mt-1 w-40 rounded-lg border border-border bg-popover p-1 shadow-xl">
              {NEW_TAB_ITEMS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  disabled={!item.enabled}
                  onClick={() => {
                    onOpen(item.kind);
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sm ${
                    item.enabled
                      ? "text-foreground hover:bg-secondary"
                      : "cursor-not-allowed text-muted-foreground"
                  }`}
                >
                  {item.label}
                  {!item.enabled && (
                    <span className="ml-auto text-[10px] text-muted-foreground">soon</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
