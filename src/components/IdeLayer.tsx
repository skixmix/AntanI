import { useEffect, useRef } from "react";
import type { Project } from "../lib/types";
import { IdeView } from "./IdeView";

interface IdeLayerProps {
  projects: Project[];
  activeProjectId: string | null;
  ideOpen: boolean;
}

/**
 * Mounts IdeView for a project only after the IDE has been opened at least once
 * for that project, avoiding a VS Code server startup on app launch.
 * Once mounted, the view stays alive (hidden when not visible) so unsaved buffers persist.
 */
export function IdeLayer({ projects, activeProjectId, ideOpen }: IdeLayerProps) {
  // Track which project IDs have ever had the IDE opened
  const everOpenedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (ideOpen && activeProjectId) {
      everOpenedRef.current.add(activeProjectId);
    }
  }, [ideOpen, activeProjectId]);

  return (
    <>
      {projects.map((project) => {
        if (!everOpenedRef.current.has(project.id)) return null;
        const visible = project.id === activeProjectId && ideOpen;
        return (
          <IdeView
            key={project.id}
            projectId={project.id}
            folder={project.path}
            visible={visible}
          />
        );
      })}
    </>
  );
}
