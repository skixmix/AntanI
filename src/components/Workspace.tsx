import { projectTabs, type TabKind, type TabStatus, type TabsState } from "../lib/tabs";
import type { Project } from "../lib/types";
import { EmptyPane } from "./EmptyPane";
import { IdeLayer } from "./IdeLayer";
import { TabStrip } from "./TabStrip";
import { TerminalLayer } from "./TerminalLayer";

interface WorkspaceProps {
  project: Project | null;
  projects: Project[];
  tabs: TabsState;
  tabStatuses: Record<string, TabStatus>;
  ideOpen: boolean;
  ideEverOpenedByProject: Record<string, boolean>;
  ideInstanceCount: number;
  memMb: number | null;
  onOpenTab: (kind: TabKind) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, title: string) => void;
  onRecolorTab: (tabId: string, color: string) => void;
  onReorderTab: (fromId: string, insertBeforeId: string | null) => void;
  onToggleIde: () => void;
  onStatusChange: (tabId: string, status: TabStatus) => void;
}

export function Workspace({
  project,
  projects,
  tabs,
  tabStatuses,
  ideOpen,
  ideEverOpenedByProject,
  ideInstanceCount,
  memMb,
  onOpenTab,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  onRecolorTab,
  onReorderTab,
  onToggleIde,
  onStatusChange,
}: WorkspaceProps) {
  if (!project) {
    return (
      <main className="flex flex-1 items-center justify-center text-muted-foreground no-select">
        <p className="text-sm">Select a project, or add one with the + button.</p>
      </main>
    );
  }

  const { tabs: projectTabList, activeTabId } = projectTabs(tabs, project.id);
  const isEmpty = projectTabList.length === 0 && !ideOpen;

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div
        className="w-full shrink-0"
        style={{ height: 1, backgroundColor: project.color, opacity: 0.4 }}
      />

      <TabStrip
        tabs={projectTabList}
        activeTabId={activeTabId}
        tabStatuses={tabStatuses}
        project={project}
        ideOpen={ideOpen}
        ideInstanceCount={ideInstanceCount}
        memMb={memMb}
        onOpen={onOpenTab}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onRename={onRenameTab}
        onRecolor={onRecolorTab}
        onReorder={onReorderTab}
        onToggleIde={onToggleIde}
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
            <EmptyPane project={project} onOpen={onOpenTab} onToggleIde={onToggleIde} />
          </div>
        )}
      </div>
    </main>
  );
}
