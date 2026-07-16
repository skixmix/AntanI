import { useRef } from "react";
import {
  DEFAULT_SPLIT_RATIO,
  focusedTab,
  type PaneId,
  projectTabs,
  splitMembers,
  type Tab,
  type TabKind,
  type TabStatus,
  type TabsState,
} from "../lib/tabs";
import type { CustomCommand, Project } from "../lib/types";
import { type SplitGeometry, usePaneSwapDrag } from "../lib/usePaneSwapDrag";
import { EmptyPane } from "./EmptyPane";
import { IdeLayer } from "./IdeLayer";
import { InjectBar } from "./InjectBar";
import type { CommandsSubTab } from "./SettingsPage";
import { SourceControlSidebar } from "./SourceControlSidebar";
import { SplitGrid } from "./SplitGrid";
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
  onAddToSplit?: (tabId: string) => void;
  onUnsplit?: () => void;
  onFocusPane?: (pane: PaneId) => void;
  onSetSplitRatio?: (ratio: number) => void;
  onSetSplitRowRatio?: (ratio: number) => void;
  onSwapPanes?: (paneA: PaneId, paneB: PaneId) => void;
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
  onSetSplitRowRatio,
  onSwapPanes,
  onOpenToSide,
  onAddToSplit,
  onUnsplit,
  onViewSplit,
  onRenameSplit,
  onRecolorSplit,
}: WorkspaceProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const geometryRef = useRef<SplitGeometry>({
    colRatio: DEFAULT_SPLIT_RATIO,
    rowRatio: DEFAULT_SPLIT_RATIO,
    memberCount: 0,
  });
  const { startDrag, draggingPane, dropOver } = usePaneSwapDrag(
    contentRef,
    geometryRef,
    (a, b) => onSwapPanes?.(a, b),
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
  const colRatio = pt.split?.ratio ?? DEFAULT_SPLIT_RATIO;
  const rowRatio = pt.split?.rowRatio ?? DEFAULT_SPLIT_RATIO;
  const ideTabId = projectTabList.find((t) => t.kind === "ide")?.id ?? null;
  const isEmpty = projectTabList.length === 0;
  const members = splitMembers(pt).filter((t): t is Tab => t !== null);
  const soloTab = !viewingSplit ? (projectTabList.find((t) => t.id === activeTabId) ?? null) : null;
  const paneTabIds = members.length > 0 ? members.map((t) => t.id) : soloTab ? [soloTab.id] : [];
  geometryRef.current = { colRatio, rowRatio, memberCount: members.length };
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
          onAddToSplit={onAddToSplit}
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
            paneTabIds={paneTabIds}
            colRatio={colRatio}
            rowRatio={rowRatio}
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
          {members.length > 1 && (
            <SplitGrid
              members={members}
              colRatio={colRatio}
              rowRatio={rowRatio}
              focusedPane={focusedPane}
              tabStatuses={tabStatuses}
              runningTabs={runningTabs}
              containerRef={contentRef}
              draggingPane={draggingPane}
              dropOver={dropOver}
              onStartDrag={startDrag}
              onSetColRatio={onSetSplitRatio ?? (() => {})}
              onSetRowRatio={onSetSplitRowRatio ?? (() => {})}
              onCloseTab={onCloseTab}
              onRenameTab={onRenameTab}
              onRecolorTab={onRecolorTab}
              onUnsplit={onUnsplit}
            />
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
