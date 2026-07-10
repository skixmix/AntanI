import type { ReactNode } from "react";
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

const QUICK_OPEN: { kind: TabKind; label: string; icon: ReactNode }[] = [
  {
    kind: "terminal",
    label: "Terminal",
    icon: <span className="font-mono text-[11px]">&gt;_</span>,
  },
  {
    kind: "opencode",
    label: "OpenCode",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8l2.5-2.5L10 8l-2.5 2.5L5 8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    kind: "claude",
    label: "Claude",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M8 1 L9.2 5.5 L13.5 4 L11 8 L13.5 12 L9.2 10.5 L8 15 L6.8 10.5 L2.5 12 L5 8 L2.5 4 L6.8 5.5 Z"
          fill="#d4622a"
        />
      </svg>
    ),
  },
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
  return (
    <div className="flex flex-col border-b border-border">
      {/* Tab row */}
      <div className="flex items-end gap-0 px-2 pt-1.5 overflow-x-auto">
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
        <button
          type="button"
          title="New tab"
          onClick={() => onOpen("terminal")}
          className="mb-0.5 ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-base text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          +
        </button>
      </div>

      {/* Quick-open toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-t border-border/50">
        {QUICK_OPEN.map((item) => (
          <button
            key={item.kind}
            type="button"
            title={`New ${item.label} tab`}
            onClick={() => onOpen(item.kind)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
