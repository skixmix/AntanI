import { projectTabs, type TabStatus, type TabsState } from "../lib/tabs";
import type { Project } from "../lib/types";
import { TerminalView } from "./TerminalView";

interface TerminalLayerProps {
  projects: Project[];
  tabs: TabsState;
  activeProjectId: string | null;
  fontSize: number;
  onStatusChange: (tabId: string, status: TabStatus) => void;
}

export function TerminalLayer({
  projects,
  tabs,
  activeProjectId,
  fontSize,
  onStatusChange,
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
              cwd={project.path}
              startupCommand={tab.startupCommand}
              visible={project.id === activeProjectId && tab.id === activeTabId}
              fontSize={fontSize}
              isAi={tab.kind === "claude" || tab.kind === "opencode"}
              onStatusChange={onStatusChange}
            />
          ));
      })}
    </>
  );
}
