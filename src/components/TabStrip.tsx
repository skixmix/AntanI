import type { ReactNode } from "react";
import { projectInitials } from "../lib/constants";
import type { Tab, TabKind, TabStatus } from "../lib/tabs";
import type { CustomCommand, Project } from "../lib/types";
import { useDragReorder } from "../lib/useDragReorder";
import {
  AnthropicIcon,
  CloseIcon,
  CustomCommandIcon,
  OpenCodeIcon,
  TerminalIcon,
  VSCodeIcon,
  WrenchIcon,
} from "./Icons";
import { TabChip } from "./TabChip";

interface TabStripProps {
  tabs: Tab[];
  activeTabId: string | null;
  tabStatuses: Record<string, TabStatus>;
  needsAttention: Record<string, true>;
  project: Project;
  ideOpen: boolean;
  ideRunning: boolean;
  ideInstanceCount: number;
  memMb: number | null;
  onOpen: (kind: TabKind) => void;
  onOpenCustom: (cmd: CustomCommand) => void;
  onOpenCommandSettings: () => void;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onRename: (tabId: string, title: string) => void;
  onRecolor: (tabId: string, color: string) => void;
  onReorder: (fromId: string, insertBeforeId: string | null) => void;
  onOpenIde: () => void;
  onCloseIde: () => void;
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
  needsAttention,
  project,
  ideOpen,
  ideRunning,
  ideInstanceCount,
  memMb,
  onOpen,
  onOpenCustom,
  onOpenCommandSettings,
  onSelect,
  onClose,
  onRename,
  onRecolor,
  onReorder,
  onOpenIde,
  onCloseIde,
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
        {/* Project avatar — extra left padding clears room for the projects
            sidebar's floating collapse toggle, which pokes in from the left edge */}
        <div
          className="flex shrink-0 items-center justify-center pl-5 pr-3 no-select"
          title={project.path}
          style={{ borderRight: "1px solid var(--color-border)" }}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-black/80"
            style={{ backgroundColor: project.color }}
          >
            {projectInitials(project.name)}
          </span>
        </div>

        {/* Tabs */}
        {tabs.map((tab) => (
          <TabChip
            key={tab.id}
            tab={tab}
            active={!ideOpen && tab.id === activeTabId}
            status={tabStatuses[tab.id]}
            needsAttention={!!needsAttention[tab.id]}
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

        {/* VS Code open/close — extra right padding clears room for the source
            control sidebar's floating collapse toggle, which pokes in from the right edge */}
        <div
          onClick={onOpenIde}
          title={ideRunning ? "Show VS Code" : "Open embedded VS Code"}
          className={`group flex shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border pl-3 pr-5 cursor-pointer transition-colors ${
            ideOpen
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            {ideRunning && (
              <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                <span className="flex items-center justify-center transition-opacity group-hover:opacity-0">
                  <span className="h-2 w-2 rounded-full bg-green-400" title="Running" />
                </span>
                <button
                  type="button"
                  aria-label="Close VS Code"
                  title="Close VS Code"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseIde();
                  }}
                  className="absolute inset-0 flex items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            )}
            <VSCodeIcon size={14} className="text-[#007ACC]" />
            VS Code
          </div>
          <div className={`text-[10px] leading-none ${memColor}`}>
            {memLabel}
            {memMb !== null && ideInstanceCount > 1 && ` · ${ideInstanceCount} open`}
          </div>
        </div>
      </div>

      {/* Quick-open toolbar */}
      <div className="flex items-stretch text-xs" style={{ height: 34 }}>
        {/* Settings — left anchor */}
        <button
          type="button"
          title="Manage commands"
          onClick={onOpenCommandSettings}
          className="flex shrink-0 items-center px-3 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          style={{ borderRight: "1px solid var(--color-border)" }}
        >
          <WrenchIcon size={13} />
        </button>

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

          {project.customCommands.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              title={`New ${cmd.name} tab`}
              onClick={() => onOpenCustom(cmd)}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <span style={{ color: cmd.color }}>
                <CustomCommandIcon size={13} />
              </span>
              <span>{cmd.name}</span>
            </button>
          ))}

          <button
            type="button"
            title="Add command"
            onClick={onOpenCommandSettings}
            className="flex items-center justify-center rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
