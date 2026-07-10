import type { ReactNode } from "react";
import type { Tab, TabKind, TabStatus } from "../lib/tabs";
import type { Project } from "../lib/types";
import { useDragReorder } from "../lib/useDragReorder";
import { AnthropicIcon, OpenCodeIcon, TerminalIcon, VSCodeIcon } from "./Icons";
import { TabChip } from "./TabChip";

interface TabStripProps {
  tabs: Tab[];
  activeTabId: string | null;
  tabStatuses: Record<string, TabStatus>;
  project: Project;
  ideOpen: boolean;
  ideInstanceCount: number;
  memMb: number | null;
  onOpen: (kind: TabKind) => void;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onRename: (tabId: string, title: string) => void;
  onRecolor: (tabId: string, color: string) => void;
  onReorder: (fromId: string, insertBeforeId: string | null) => void;
  onToggleIde: () => void;
}

const QUICK_OPEN: { kind: TabKind; label: string; icon: ReactNode }[] = [
  { kind: "terminal", label: "Terminal", icon: <TerminalIcon size={13} /> },
  { kind: "opencode", label: "OpenCode", icon: <OpenCodeIcon size={13} /> },
  { kind: "claude", label: "Claude", icon: <AnthropicIcon size={13} /> },
];

export function TabStrip({
  tabs,
  activeTabId,
  tabStatuses,
  project,
  ideOpen,
  ideInstanceCount,
  memMb,
  onOpen,
  onSelect,
  onClose,
  onRename,
  onRecolor,
  onReorder,
  onToggleIde,
}: TabStripProps) {
  const { draggingId, insertBeforeId, startDrag } = useDragReorder("tabs", false, onReorder);

  const memLabel =
    memMb === null ? "off" : memMb >= 1024 ? `${(memMb / 1024).toFixed(1)} GB` : `${memMb} MB`;

  const memColor =
    memMb === null
      ? "text-muted-foreground/70"
      : memMb >= 3072
        ? "text-red-400"
        : memMb >= 1536
          ? "text-yellow-400"
          : "text-muted-foreground/70";

  return (
    <div className="flex flex-col border-b border-border shrink-0">
      {/* Tab row */}
      <div
        className="flex items-stretch overflow-x-auto"
        style={{ borderBottom: "1px solid var(--color-border)", height: 52 }}
      >
        {/* Project avatar */}
        <div
          className="flex shrink-0 items-center justify-center px-3 no-select"
          title={project.path}
          style={{ borderRight: "1px solid var(--color-border)" }}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-black/80"
            style={{ backgroundColor: project.color }}
          >
            {project.name.charAt(0).toUpperCase()}
          </span>
        </div>

        {/* Tabs */}
        {tabs.map((tab) => (
          <TabChip
            key={tab.id}
            tab={tab}
            active={!ideOpen && tab.id === activeTabId}
            status={tabStatuses[tab.id]}
            isDragging={draggingId === tab.id}
            showInsertBefore={insertBeforeId === tab.id && draggingId !== tab.id}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            onRename={(title) => onRename(tab.id, title)}
            onRecolor={(color) => onRecolor(tab.id, color)}
            onPointerDown={(e) => startDrag(e, tab.id)}
          />
        ))}

        {/* Append-end insertion bar */}
        {draggingId && insertBeforeId === null && (
          <div className="w-0.5 self-stretch shrink-0 bg-primary/80 rounded-full mx-0.5 my-1" />
        )}

        {/* + new tab — bordered pill */}
        <div className="flex items-center px-2 shrink-0">
          <button
            type="button"
            title="New terminal tab"
            onClick={() => onOpen("terminal")}
            className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary/50 hover:bg-secondary hover:text-foreground transition-colors text-base leading-none"
          >
            +
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* VS Code toggle */}
        <button
          type="button"
          onClick={onToggleIde}
          title={ideOpen ? "Close VS Code" : "Open embedded VS Code"}
          className={`flex shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border px-3 transition-colors ${
            ideOpen
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <VSCodeIcon size={14} className="text-[#007ACC]" />
            VS Code
          </div>
          <div className={`text-[10px] leading-none ${memColor}`}>
            {memLabel}
            {memMb !== null && ideInstanceCount > 1 && ` · ${ideInstanceCount} open`}
          </div>
        </button>
      </div>

      {/* Quick-open toolbar */}
      <div className="flex items-stretch text-xs" style={{ height: 34 }}>
        {/* Gear placeholder — left anchor */}
        <div
          className="flex shrink-0 items-center px-3 text-muted-foreground"
          style={{ borderRight: "1px solid var(--color-border)" }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Quick-open buttons */}
        <div className="flex items-center gap-0.5 px-1.5">
          {QUICK_OPEN.map((item) => (
            <button
              key={item.kind}
              type="button"
              title={`New ${item.label} tab`}
              onClick={() => onOpen(item.kind)}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
