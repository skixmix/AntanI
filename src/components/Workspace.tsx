import { projectTabs, type TabKind, type TabStatus, type TabsState } from "../lib/tabs";
import type { CustomCommand, Project } from "../lib/types";
import { EmptyPane } from "./EmptyPane";
import { IdeLayer } from "./IdeLayer";
import { SourceControlSidebar } from "./SourceControlSidebar";
import { TabStrip } from "./TabStrip";
import { TerminalLayer } from "./TerminalLayer";

interface WorkspaceProps {
  project: Project | null;
  projects: Project[];
  tabs: TabsState;
  tabStatuses: Record<string, TabStatus>;
  needsAttention: Record<string, true>;
  ideOpen: boolean;
  ideRunning: boolean;
  ideEverOpenedByProject: Record<string, boolean>;
  ideInstanceCount: number;
  memMb: number | null;
  onOpenTab: (kind: TabKind) => void;
  onOpenCustomTab: (cmd: CustomCommand) => void;
  onOpenCommandSettings: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, title: string) => void;
  onRecolorTab: (tabId: string, color: string) => void;
  onReorderTab: (fromId: string, insertBeforeId: string | null) => void;
  onCloseIde: () => void;
  onOpenIde: () => void;
  onStatusChange: (tabId: string, status: TabStatus) => void;
}

export function Workspace({
  project,
  projects,
  tabs,
  tabStatuses,
  needsAttention,
  ideOpen,
  ideRunning,
  ideEverOpenedByProject,
  ideInstanceCount,
  memMb,
  onOpenTab,
  onOpenCustomTab,
  onOpenCommandSettings,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  onRecolorTab,
  onReorderTab,
  onCloseIde,
  onOpenIde,
  onStatusChange,
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
  const isEmpty = projectTabList.length === 0 && !ideOpen;

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="w-full shrink-0" style={{ height: 2, backgroundColor: project.color }} />

        <TabStrip
          tabs={projectTabList}
          activeTabId={activeTabId}
          tabStatuses={tabStatuses}
          needsAttention={needsAttention}
          project={project}
          ideOpen={ideOpen}
          ideRunning={ideRunning}
          ideInstanceCount={ideInstanceCount}
          memMb={memMb}
          onOpen={onOpenTab}
          onOpenCustom={onOpenCustomTab}
          onOpenCommandSettings={onOpenCommandSettings}
          onSelect={onSelectTab}
          onClose={onCloseTab}
          onRename={onRenameTab}
          onRecolor={onRecolorTab}
          onReorder={onReorderTab}
          onOpenIde={onOpenIde}
          onCloseIde={onCloseIde}
        />

        <div className="relative flex-1 overflow-hidden">
          <TerminalLayer
            projects={projects}
            tabs={tabs}
            activeProjectId={project.id}
            onStatusChange={onStatusChange}
          />
          <IdeLayer
            projects={projects}
            activeProjectId={project.id}
            ideOpen={ideOpen}
            ideEverOpenedByProject={ideEverOpenedByProject}
          />
          {isEmpty && (
            <div className="absolute inset-0">
              <EmptyPane project={project} onOpen={onOpenTab} onOpenIde={onOpenIde} />
            </div>
          )}
        </div>
      </main>
      <SourceControlSidebar project={project} onOpenIde={onOpenIde} />
    </>
  );
}
