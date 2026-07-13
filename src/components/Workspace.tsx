import { projectTabs, type TabKind, type TabStatus, type TabsState } from "../lib/tabs";
import type { CustomCommand, Project } from "../lib/types";
import { EmptyPane } from "./EmptyPane";
import { IdeLayer } from "./IdeLayer";
import { InjectBar } from "./InjectBar";
import type { CommandsSubTab } from "./SettingsPage";
import { SourceControlSidebar } from "./SourceControlSidebar";
import { TabStrip } from "./TabStrip";
import { TerminalLayer } from "./TerminalLayer";

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
}: WorkspaceProps) {
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

  const { tabs: projectTabList, activeTabId } = projectTabs(tabs, project.id);
  const ideTabId = projectTabList.find((t) => t.kind === "ide")?.id ?? null;
  const isEmpty = projectTabList.length === 0;
  const activeTab = projectTabList.find((t) => t.id === activeTabId) ?? null;
  const showInjectBar = activeTab !== null && activeTab.kind !== "ide";

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="w-full shrink-0" style={{ height: 2, backgroundColor: project.color }} />

        <TabStrip
          tabs={projectTabList}
          activeTabId={activeTabId}
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
        />

        <div className="relative flex-1 overflow-hidden">
          <TerminalLayer
            projects={projects}
            tabs={tabs}
            activeProjectId={project.id}
            fontSize={terminalFontSize}
            onStatusChange={onStatusChange}
            onRunningChange={onRunningChange}
          />
          <IdeLayer projects={projects} tabs={tabs} activeProjectId={project.id} />
          {isEmpty && (
            <div className="absolute inset-0">
              <EmptyPane project={project} onOpen={onOpenTab} onOpenIde={onOpenIde} />
            </div>
          )}
        </div>

        {showInjectBar && activeTab && (
          <InjectBar
            project={project}
            activeTab={activeTab}
            onOpenCommandSettings={onOpenCommandSettings}
          />
        )}
      </main>
      <SourceControlSidebar project={project} onOpenIde={onOpenIde} />
    </>
  );
}
