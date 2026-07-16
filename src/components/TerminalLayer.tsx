import { SPLIT_HEADER_H } from "../lib/constants";
import {
  DEFAULT_SPLIT_RATIO,
  isAgentKind,
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
  leftTabId?: string | null;
  rightTabId?: string | null;
  splitRatio?: number;
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
  leftTabId,
  rightTabId,
  splitRatio,
  focusedPane,
  onFocusPane,
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
          .map((tab) => {
            const isActiveProject = project.id === activeProjectId;

            if (leftTabId === undefined) {
              return (
                <TerminalView
                  key={tab.id}
                  tabId={tab.id}
                  projects={projects}
                  cwd={project.path}
                  startupCommand={tab.startupCommand}
                  visible={isActiveProject && tab.id === activeTabId}
                  fontSize={fontSize}
                  agentKind={isAgentKind(tab.kind) ? tab.kind : undefined}
                  onStatusChange={onStatusChange}
                  onRunningChange={onRunningChange}
                  onOpenFile={onOpenFile}
                />
              );
            }

            const isLeft = tab.id === leftTabId;
            const isRight = rightTabId != null && tab.id === rightTabId;
            const visible = isActiveProject && (isLeft || isRight);

            let rect: { left: number; width: number; top?: number } | undefined;
            if (isActiveProject && visible) {
              if (rightTabId == null) {
                rect = { left: 0, width: 1 };
              } else if (isLeft) {
                rect = { left: 0, width: splitRatio ?? DEFAULT_SPLIT_RATIO, top: SPLIT_HEADER_H };
              } else {
                rect = {
                  left: splitRatio ?? DEFAULT_SPLIT_RATIO,
                  width: 1 - (splitRatio ?? DEFAULT_SPLIT_RATIO),
                  top: SPLIT_HEADER_H,
                };
              }
            }

            const focused =
              isActiveProject &&
              ((isLeft && (rightTabId == null || focusedPane === "primary")) ||
                (isRight && focusedPane === "secondary"));

            const onFocus = isActiveProject
              ? () => onFocusPane?.(isRight ? "secondary" : "primary")
              : undefined;

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
