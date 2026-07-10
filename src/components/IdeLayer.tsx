import type { Project } from "../lib/types";
import { IdeView } from "./IdeView";

interface IdeLayerProps {
  projects: Project[];
  activeProjectId: string | null;
  ideOpen: boolean;
  ideEverOpenedByProject: Record<string, boolean>;
}

export function IdeLayer({
  projects,
  activeProjectId,
  ideOpen,
  ideEverOpenedByProject,
}: IdeLayerProps) {
  return (
    <>
      {projects.map((project) => {
        if (!ideEverOpenedByProject[project.id]) return null;
        return (
          <IdeView
            key={project.id}
            projectId={project.id}
            folder={project.path}
            visible={project.id === activeProjectId && ideOpen}
          />
        );
      })}
    </>
  );
}
