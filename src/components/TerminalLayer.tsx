import { paneRect } from "../lib/splitLayout";
import {
  DEFAULT_SPLIT_RATIO,
  isAgentKind,
  PANE_IDS,
  type PaneId,
  projectTabs,
  type TabStatus,
  type TabsState,
} from "../lib/tabs";
import type { Project } from "../lib/types";
import { TerminalView } from "./TerminalView";
import type { TerminalFileOpenTarget } from "./terminalFileLinkProvider";

interface TerminalLayerProps {
  projects: Project[];
  tabs: TabsState;
  activeProjectId: string | null;
  fontSize: number;
  /** Tab ids of the currently visible pane(s), in quadrant order: a single
   *  id for the solo (non-split) view, 2-4 for an active split. */
  paneTabIds: string[];
  colRatio?: number;
  rowRatio?: number;
  focusedPane?: PaneId;
  onFocusPane?: (pane: PaneId) => void;
  onStatusChange: (tabId: string, status: TabStatus) => void;
  onRunningChange: (tabId: string, running: boolean) => void;
  onOpenFile: (target: TerminalFileOpenTarget) => void;
}

export function TerminalLayer({
  projects,
  tabs,
  activeProjectId,
  fontSize,
  paneTabIds,
  colRatio,
  rowRatio,
  focusedPane,
  onFocusPane,
  onStatusChange,
  onRunningChange,
  onOpenFile,
}: TerminalLayerProps) {
  return (
    <>
      {projects.flatMap((project) => {
        const { tabs: projectTabList } = projectTabs(tabs, project.id);
        return projectTabList
          .filter((tab) => tab.kind !== "ide")
          .map((tab) => {
            const isActiveProject = project.id === activeProjectId;
            const index = paneTabIds.indexOf(tab.id);
            const isSplit = paneTabIds.length > 1;
            const visible = isActiveProject && index !== -1;

            const rect =
              isActiveProject && visible && isSplit
                ? paneRect(
                    index,
                    paneTabIds.length,
                    colRatio ?? DEFAULT_SPLIT_RATIO,
                    rowRatio ?? DEFAULT_SPLIT_RATIO,
                  )
                : undefined;

            const paneId = index !== -1 ? PANE_IDS[index] : undefined;
            const focused = isActiveProject && visible && (!isSplit || focusedPane === paneId);
            const onFocus =
              isActiveProject && isSplit && paneId ? () => onFocusPane?.(paneId) : undefined;

            return (
              <TerminalView
                key={tab.id}
                tabId={tab.id}
                projects={projects}
                cwd={project.path}
                startupCommand={tab.startupCommand}
                visible={visible}
                fontSize={fontSize}
                agentKind={isAgentKind(tab.kind) ? tab.kind : undefined}
                rect={rect}
                focused={focused}
                onFocus={onFocus}
                onStatusChange={onStatusChange}
                onRunningChange={onRunningChange}
                onOpenFile={onOpenFile}
              />
            );
          });
      })}
    </>
  );
}
