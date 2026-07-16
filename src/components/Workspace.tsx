import { useRef } from "react";
import { SPLIT_HEADER_H } from "../lib/constants";
import {
  activePaneTabs,
  DEFAULT_SPLIT_RATIO,
  focusedTab,
  type PaneId,
  projectTabs,
  type TabKind,
  type TabStatus,
  type TabsState,
} from "../lib/tabs";
import type { CustomCommand, Project } from "../lib/types";
import { usePaneSwapDrag } from "../lib/usePaneSwapDrag";
import { EmptyPane } from "./EmptyPane";
import { IdeLayer } from "./IdeLayer";
import { InjectBar } from "./InjectBar";
import { PaneHeader } from "./PaneHeader";
import type { CommandsSubTab } from "./SettingsPage";
import { SourceControlSidebar } from "./SourceControlSidebar";
import { SplitDivider } from "./SplitDivider";
import { TabStrip } from "./TabStrip";
import { TerminalLayer } from "./TerminalLayer";
import type { TerminalFileOpenTarget } from "./terminalFileLinkProvider";

interface WorkspaceProps {
  project: Project | null;
  projects: Project[];
  tabs: TabsState;
  tabStatuses: Record<string, TabStatus>;
  runningTabs: Record<string, true>;
  needsAttention: Record<string, true>;
  terminalFontSize: number;
  onOpenTab: (kind: TabKind) => void;
  onOpenCustomTab: (cmd: CustomCommand) => void;
  onOpenCommandSettings: (subTab?: CommandsSubTab) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, title: string) => void;
  onRecolorTab: (tabId: string, color: string) => void;
  onReorderTab: (fromId: string, insertBeforeId: string | null) => void;
  onOpenIde: () => void;
  onStatusChange: (tabId: string, status: TabStatus) => void;
  onRunningChange: (tabId: string, running: boolean) => void;
  onOpenFile: (target: TerminalFileOpenTarget) => void;
  onOpenToSide?: (tabId: string) => void;
  onUnsplit?: () => void;
  onFocusPane?: (pane: PaneId) => void;
  onSetSplitRatio?: (ratio: number) => void;
  onSwapPanes?: () => void;
  onViewSplit?: () => void;
  onRenameSplit?: (title: string) => void;
  onRecolorSplit?: (color: string) => void;
}

export function Workspace({
  project,
  projects,
  tabs,
  tabStatuses,
  runningTabs,
  needsAttention,
  terminalFontSize,
  onOpenTab,
  onOpenCustomTab,
  onOpenCommandSettings,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  onRecolorTab,
  onReorderTab,
  onOpenIde,
  onStatusChange,
  onRunningChange,
  onOpenFile,
  onFocusPane,
  onSetSplitRatio,
  onSwapPanes,
  onOpenToSide,
  onUnsplit,
  onViewSplit,
  onRenameSplit,
  onRecolorSplit,
}: WorkspaceProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const splitRatioRef = useRef(DEFAULT_SPLIT_RATIO);
  const { startDrag, draggingPane, dropOver } = usePaneSwapDrag(
    contentRef,
    splitRatioRef,
    () => onSwapPanes?.(),
    (pane) => onFocusPane?.(pane),
  );

  if (!project) {
    return (
      <>
        <main className="flex flex-1 items-center justify-center text-muted-foreground no-select">
          <p className="text-sm">Select a project, or add one with the + button.</p>
        </main>
        <SourceControlSidebar project={null} onOpenIde={onOpenIde} />
      </>
    );
  }

  const pt = projectTabs(tabs, project.id);
  const { tabs: projectTabList, activeTabId } = pt;
  const split = pt.split;
  const viewingSplit = pt.viewingSplit;
  const focusedPane = pt.split?.focusedPane ?? "primary";
  const splitRatio = pt.split?.ratio ?? DEFAULT_SPLIT_RATIO;
  splitRatioRef.current = splitRatio;
  const ideTabId = projectTabList.find((t) => t.kind === "ide")?.id ?? null;
  const isEmpty = projectTabList.length === 0;
  const { primary, secondary } = activePaneTabs(pt);
  const focused = focusedTab(pt);
  const showInjectBar = focused !== null && focused.kind !== "ide";

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="w-full shrink-0" style={{ height: 2, backgroundColor: project.color }} />

        <TabStrip
          tabs={projectTabList}
          activeTabId={activeTabId}
          split={split}
          viewingSplit={viewingSplit}
          tabStatuses={tabStatuses}
          runningTabs={runningTabs}
          needsAttention={needsAttention}
          project={project}
          ideTabId={ideTabId}
          onOpen={onOpenTab}
          onOpenCustom={onOpenCustomTab}
          onOpenCommandSettings={onOpenCommandSettings}
          onSelect={onSelectTab}
          onClose={onCloseTab}
          onRename={onRenameTab}
          onRecolor={onRecolorTab}
          onReorder={onReorderTab}
          onOpenIde={onOpenIde}
          onOpenToSide={onOpenToSide}
          onUnsplit={onUnsplit}
          onViewSplit={onViewSplit}
          onRenameSplit={onRenameSplit}
          onRecolorSplit={onRecolorSplit}
        />

        <div ref={contentRef} className="relative flex-1 overflow-hidden">
          <TerminalLayer
            projects={projects}
            tabs={tabs}
            activeProjectId={project.id}
            fontSize={terminalFontSize}
            leftTabId={primary?.id ?? null}
            rightTabId={secondary?.id ?? null}
            splitRatio={splitRatio}
            focusedPane={focusedPane}
            onFocusPane={onFocusPane}
            onStatusChange={onStatusChange}
            onRunningChange={onRunningChange}
            onOpenFile={onOpenFile}
          />
          <IdeLayer projects={projects} tabs={tabs} activeProjectId={project.id} />
          {isEmpty && (
            <div className="absolute inset-0">
              <EmptyPane project={project} onOpen={onOpenTab} onOpenIde={onOpenIde} />
            </div>
          )}
          {secondary && (
            <>
              {primary && (
                <>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${splitRatio * 100}%`,
                      height: SPLIT_HEADER_H,
                      zIndex: 10,
                    }}
                  >
                    <PaneHeader
                      tab={primary}
                      focused={focusedPane === "primary"}
                      status={tabStatuses[primary.id]}
                      running={!!runningTabs[primary.id]}
                      dragging={draggingPane === "primary"}
                      onHeaderPointerDown={(e) => startDrag("primary", e)}
                      onClose={() => onCloseTab(primary.id)}
                      onRename={(t) => onRenameTab(primary.id, t)}
                      onRecolor={(c) => onRecolorTab(primary.id, c)}
                    />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: `${splitRatio * 100}%`,
                      right: 0,
                      height: SPLIT_HEADER_H,
                      zIndex: 10,
                    }}
                  >
                    <PaneHeader
                      tab={secondary}
                      focused={focusedPane === "secondary"}
                      status={tabStatuses[secondary.id]}
                      running={!!runningTabs[secondary.id]}
                      dragging={draggingPane === "secondary"}
                      onHeaderPointerDown={(e) => startDrag("secondary", e)}
                      onClose={() => onCloseTab(secondary.id)}
                      onRename={(t) => onRenameTab(secondary.id, t)}
                      onRecolor={(c) => onRecolorTab(secondary.id, c)}
                    />
                  </div>
                </>
              )}
              <SplitDivider
                ratio={splitRatio}
                containerRef={contentRef}
                onRatioChange={onSetSplitRatio ?? (() => {})}
              />
              <div
                className="pointer-events-none absolute top-0 bottom-0 rounded-sm ring-2 ring-primary/40"
                style={
                  focusedPane === "primary"
                    ? { left: 0, width: `${splitRatio * 100}%` }
                    : { left: `${splitRatio * 100}%`, right: 0 }
                }
              />
              {draggingPane && dropOver && dropOver !== draggingPane && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-20 rounded-sm bg-primary/10 ring-2 ring-primary"
                  style={
                    dropOver === "primary"
                      ? { left: 0, width: `${splitRatio * 100}%` }
                      : { left: `${splitRatio * 100}%`, right: 0 }
                  }
                />
              )}
            </>
          )}
        </div>

        {showInjectBar && focused && (
          <InjectBar
            project={project}
            activeTab={focused}
            onOpenCommandSettings={onOpenCommandSettings}
          />
        )}
      </main>
      <SourceControlSidebar project={project} onOpenIde={onOpenIde} />
    </>
  );
}
