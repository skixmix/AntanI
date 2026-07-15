import { isAgentKind, projectTabs, type TabStatus, type TabsState } from "../lib/tabs";
import type { Project } from "../lib/types";
import { TerminalView } from "./TerminalView";
import type { TerminalFileOpenTarget } from "./terminalFileLinkProvider";

interface TerminalLayerProps {
  projects: Project[];
  tabs: TabsState;
  activeProjectId: string | null;
  fontSize: number;
  onStatusChange: (tabId: string, status: TabStatus) => void;
  onRunningChange: (tabId: string, running: boolean) => void;
  onOpenFile: (target: TerminalFileOpenTarget) => void;
}

export function TerminalLayer({
  projects,
  tabs,
  activeProjectId,
  fontSize,
  onStatusChange,
  onRunningChange,
  onOpenFile,
}: TerminalLayerProps) {
  return (
    <>
      {projects.flatMap((project) => {
        const { tabs: projectTabList, activeTabId } = projectTabs(tabs, project.id);
        return projectTabList
          .filter((tab) => tab.kind !== "ide")
          .map((tab) => (
            <TerminalView
              key={tab.id}
              tabId={tab.id}
              projects={projects}
              cwd={project.path}
              startupCommand={tab.startupCommand}
              visible={project.id === activeProjectId && tab.id === activeTabId}
              fontSize={fontSize}
              agentKind={isAgentKind(tab.kind) ? tab.kind : undefined}
              onStatusChange={onStatusChange}
              onRunningChange={onRunningChange}
              onOpenFile={onOpenFile}
            />
          ));
      })}
    </>
  );
}
