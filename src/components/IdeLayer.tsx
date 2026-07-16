import { projectTabs, type TabsState } from "../lib/tabs";
import type { Project } from "../lib/types";
import { IdeView } from "./IdeView";

interface IdeLayerProps {
  projects: Project[];
  tabs: TabsState;
  activeProjectId: string | null;
}

export function IdeLayer({ projects, tabs, activeProjectId }: IdeLayerProps) {
  return (
    <>
      {projects.flatMap((project) => {
        const { tabs: projectTabList, activeTabId, viewingSplitId } = projectTabs(tabs, project.id);
        return projectTabList
          .filter((tab) => tab.kind === "ide")
          .map((tab) => (
            <IdeView
              key={tab.id}
              projectId={project.id}
              folder={project.path}
              visible={project.id === activeProjectId && tab.id === activeTabId && !viewingSplitId}
            />
          ));
      })}
    </>
  );
}
