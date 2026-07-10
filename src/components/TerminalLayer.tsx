import { projectTabs, type TabStatus, type TabsState } from "../lib/tabs";
import type { Project } from "../lib/types";
import { TerminalView } from "./TerminalView";

interface TerminalLayerProps {
  projects: Project[];
  tabs: TabsState;
  activeProjectId: string | null;
  onStatusChange: (tabId: string, status: TabStatus) => void;
}

/**
 * Renders the PTY-backed tabs of every project at once and toggles visibility,
 * so a terminal keeps running (and its xterm buffer stays intact) when the user
 * switches projects. Tabs are never unmounted on switch — only hidden.
 */
export function TerminalLayer({
  projects,
  tabs,
  activeProjectId,
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
              isAi={tab.kind === "claude" || tab.kind === "opencode"}
              onStatusChange={onStatusChange}
            />
          ));
      })}
    </>
  );
}
