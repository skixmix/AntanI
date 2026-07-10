import { projectTabs, type TabKind, type TabsState } from "../lib/tabs";
import type { Project } from "../lib/types";
import { TabStrip } from "./TabStrip";
import { TerminalLayer } from "./TerminalLayer";

interface WorkspaceProps {
  project: Project | null;
  projects: Project[];
  tabs: TabsState;
  onOpenTab: (kind: TabKind) => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, title: string) => void;
  onRecolorTab: (tabId: string, color: string) => void;
}

export function Workspace({
  project,
  projects,
  tabs,
  onOpenTab,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  onRecolorTab,
}: WorkspaceProps) {
  if (!project) {
    return (
      <main className="flex flex-1 items-center justify-center text-muted-foreground no-select">
        <p className="text-sm">Select a project, or add one with the + button.</p>
      </main>
    );
  }

  const { tabs: projectTabList, activeTabId } = projectTabs(tabs, project.id);

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 no-select">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base font-semibold text-black/80"
          style={{ backgroundColor: project.color }}
        >
          {project.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
          <div className="truncate text-xs text-muted-foreground">{project.path}</div>
        </div>
      </header>

      <TabStrip
        tabs={projectTabList}
        activeTabId={activeTabId}
        onOpen={onOpenTab}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onRename={onRenameTab}
        onRecolor={onRecolorTab}
      />

      <div className="relative flex-1 overflow-hidden">
        <TerminalLayer projects={projects} tabs={tabs} activeProjectId={project.id} />
        {projectTabList.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground no-select">
            <p className="text-sm">Use + to open a Terminal, Claude, or opencode tab.</p>
          </div>
        )}
      </div>
    </main>
  );
}
