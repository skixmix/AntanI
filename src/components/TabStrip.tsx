import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { projectInitials } from "../lib/constants";
import type { PaneRect } from "../lib/splitLayout";
import { MAX_SPLIT_MEMBERS, type Split, type Tab, type TabKind, type TabStatus } from "../lib/tabs";
import type { CustomCommand, Project } from "../lib/types";
import { type SplitDropTarget, useDragReorder } from "../lib/useDragReorder";
import {
  AnthropicIcon,
  CodexIcon,
  CustomCommandIcon,
  OpenCodeIcon,
  VSCodeIcon,
  WrenchIcon,
} from "./Icons";
import type { CommandsSubTab } from "./SettingsPage";
import { SplitGroupChip } from "./SplitGroupChip";
import { TabChip } from "./TabChip";

interface TabStripProps {
  tabs: Tab[];
  activeTabId: string | null;
  splits: Split[];
  viewingSplitId: string | null;
  tabStatuses: Record<string, TabStatus>;
  runningTabs: Record<string, true>;
  needsAttention: Record<string, true>;
  project: Project;
  ideTabId: string | null;
  onOpen: (kind: TabKind) => void;
  onOpenCustom: (cmd: CustomCommand) => void;
  onOpenCommandSettings: (subTab?: CommandsSubTab) => void;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onRename: (tabId: string, title: string) => void;
  onRecolor: (tabId: string, color: string) => void;
  onReorder: (fromId: string, insertBeforeId: string | null) => void;
  onOpenIde: () => void;
  onOpenToSide?: (tabId: string) => void;
  onAddToSplit?: (splitId: string, tabId: string) => void;
  onUnsplit?: (splitId: string) => void;
  onViewSplit?: (splitId: string) => void;
  onRenameSplit?: (splitId: string, title: string) => void;
  onRecolorSplit?: (splitId: string, color: string) => void;
  contentRef?: RefObject<HTMLDivElement | null>;
  onTabDropToSplit?: (fromId: string) => void;
  canTabDropToSplit?: (fromId: string) => boolean;
  tabDropPreviewRect?: (fromId: string) => PaneRect | null;
}

const QUICK_OPEN: { kind: TabKind; label: string; icon: ReactNode }[] = [
  { kind: "opencode", label: "OpenCode", icon: <OpenCodeIcon size={13} /> },
  { kind: "claude", label: "Claude", icon: <AnthropicIcon size={13} /> },
  { kind: "codex", label: "Codex", icon: <CodexIcon size={13} /> },
];

export function TabStrip({
  tabs,
  activeTabId,
  splits,
  viewingSplitId,
  tabStatuses,
  runningTabs,
  needsAttention,
  project,
  ideTabId,
  onOpen,
  onOpenCustom,
  onOpenCommandSettings,
  onSelect,
  onClose,
  onRename,
  onRecolor,
  onReorder,
  onOpenIde,
  onOpenToSide,
  onAddToSplit,
  onUnsplit,
  onViewSplit,
  onRenameSplit,
  onRecolorSplit,
  contentRef,
  onTabDropToSplit,
  canTabDropToSplit,
  tabDropPreviewRect,
}: TabStripProps) {
  const splitDrop: SplitDropTarget | undefined =
    contentRef && onTabDropToSplit && canTabDropToSplit
      ? {
          zoneRef: contentRef,
          canDrop: canTabDropToSplit,
          onDrop: onTabDropToSplit,
          previewRect: tabDropPreviewRect,
        }
      : undefined;
  const { draggingId, insertBeforeId, startDrag } = useDragReorder(
    "tabs",
    false,
    onReorder,
    splitDrop,
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  const currentTab = tabs.find((t) => t.id === activeTabId);
  const canSplitWithCurrent = currentTab != null && currentTab.kind !== "ide";
  const viewedSplit = viewingSplitId ? (splits.find((s) => s.id === viewingSplitId) ?? null) : null;
  const canGrowSplit = viewedSplit != null && viewedSplit.memberIds.length < MAX_SPLIT_MEMBERS;

  useEffect(() => {
    if (!activeTabId || !scrollRef.current) return;
    const container = scrollRef.current;
    const el = container.querySelector<HTMLElement>(`[data-drag-id="${activeTabId}"]`);
    if (!el) return;
    const cr = container.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const PEEK = 48;
    container.scrollTo({
      left: Math.max(0, container.scrollLeft + er.left - cr.left - PEEK),
      behavior: "smooth",
    });
  }, [activeTabId]);

  return (
    <div className="flex flex-col border-b border-border shrink-0">
      {/* Tab row */}
      <div
        className="flex items-stretch"
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

        {/* Scrollable tabs — flex-1 so it takes all remaining space */}
        <div
          ref={scrollRef}
          className="flex items-stretch flex-1 min-w-0 overflow-x-auto scrollbar-hidden"
        >
          {tabs.map((tab) => {
            const owningSplit = splits.find((s) => s.memberIds.includes(tab.id));
            if (owningSplit && tab.id !== owningSplit.memberIds[0]) {
              return null;
            }

            if (owningSplit) {
              const anchorId = owningSplit.memberIds[0];
              return (
                <SplitGroupChip
                  key={tab.id}
                  split={owningSplit}
                  viewingSplit={viewingSplitId === owningSplit.id}
                  memberStatuses={owningSplit.memberIds.map((id) => tabStatuses[id])}
                  needsAttention={owningSplit.memberIds.some((id) => !!needsAttention[id])}
                  isDragging={draggingId === owningSplit.id}
                  showInsertBefore={insertBeforeId === anchorId && draggingId !== owningSplit.id}
                  onPointerDown={(e) => startDrag(e, owningSplit.id)}
                  onView={() => onViewSplit?.(owningSplit.id)}
                  onRename={(title) => onRenameSplit?.(owningSplit.id, title)}
                  onRecolor={(color) => onRecolorSplit?.(owningSplit.id, color)}
                  onClose={() => onUnsplit?.(owningSplit.id)}
                />
              );
            }

            return (
              <TabChip
                key={tab.id}
                tab={tab}
                active={!viewingSplitId && tab.id === activeTabId}
                focused={!viewingSplitId && tab.id === activeTabId}
                status={tabStatuses[tab.id]}
                running={!!runningTabs[tab.id]}
                needsAttention={!!needsAttention[tab.id]}
                isDragging={draggingId === tab.id}
                showInsertBefore={insertBeforeId === tab.id && draggingId !== tab.id}
                onSelect={() => onSelect(tab.id)}
                onClose={() => onClose(tab.id)}
                onRename={(title) => onRename(tab.id, title)}
                onRecolor={(color) => onRecolor(tab.id, color)}
                onPointerDown={(e) => startDrag(e, tab.id)}
                onOpenToSide={
                  onOpenToSide && canSplitWithCurrent && tab.id !== activeTabId
                    ? () => onOpenToSide(tab.id)
                    : undefined
                }
                onAddToSplit={
                  onAddToSplit && canGrowSplit && tab.kind !== "ide" && viewedSplit
                    ? () => onAddToSplit(viewedSplit.id, tab.id)
                    : undefined
                }
              />
            );
          })}

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
        </div>

        {/* Spacer — extra right padding clears room for the source control
            sidebar's floating collapse toggle, which pokes in from the right edge */}
        <div className="shrink-0 pr-5" />
      </div>

      {/* Quick-open toolbar */}
      <div className="flex items-stretch text-xs" style={{ height: 34 }}>
        {/* Settings — left anchor */}
        <button
          type="button"
          title="Manage commands"
          onClick={() => onOpenCommandSettings("custom")}
          className="flex shrink-0 items-center px-3 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          style={{ borderRight: "1px solid var(--color-border)" }}
        >
          <WrenchIcon size={13} />
        </button>

        {/* Quick-open buttons */}
        <div className="flex items-center gap-0.5 px-1.5">
          {/* VS Code — routes to existing ide tab or opens a new one */}
          <button
            type="button"
            title={ideTabId ? "Switch to VS Code tab" : "Open VS Code tab"}
            onClick={onOpenIde}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <VSCodeIcon size={13} className="text-[#007ACC]" />
            <span>VS Code</span>
          </button>

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
            onClick={() => onOpenCommandSettings("custom")}
            className="flex items-center justify-center rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
