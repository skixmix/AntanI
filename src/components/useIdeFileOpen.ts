import { useCallback, useEffect, useState } from "react";
import { openFileInIde } from "../lib/api.ipc";
import { projectTabs, type TabsState } from "../lib/tabs";
import type { ResolvedTerminalFile } from "./terminalFileLinkProvider";

const IDE_BRIDGE_RETRY_MS = 10_000;
const IDE_BRIDGE_RETRY_INTERVAL_MS = 300;

interface PendingFileOpen extends ResolvedTerminalFile {
  readonly projectId: string;
  readonly projectPath: string;
}

export type OpenTerminalFileInIde = (
  projectId: string,
  projectPath: string,
  file: ResolvedTerminalFile,
) => void;

export function useIdeFileOpen(
  tabs: TabsState,
  requestOpenIde: (projectId: string) => void,
): OpenTerminalFileInIde {
  const [pending, setPending] = useState<PendingFileOpen | null>(null);

  useEffect(() => {
    if (!pending) return;
    const hasIde = projectTabs(tabs, pending.projectId).tabs.some((tab) => tab.kind === "ide");
    if (!hasIde) return;

    let active = true;
    let retryTimer: number | undefined;
    const deadline = Date.now() + IDE_BRIDGE_RETRY_MS;
    const attempt = () => {
      openFileInIde(pending.projectPath, pending.filePath, pending.line, pending.column)
        .then(() => {
          if (active) setPending((current) => (current === pending ? null : current));
        })
        .catch(() => {
          if (!active) return;
          if (Date.now() < deadline) {
            retryTimer = window.setTimeout(attempt, IDE_BRIDGE_RETRY_INTERVAL_MS);
          } else {
            setPending((current) => (current === pending ? null : current));
          }
        });
    };
    attempt();

    return () => {
      active = false;
      window.clearTimeout(retryTimer);
    };
  }, [pending, tabs]);

  return useCallback(
    (projectId, projectPath, file) => {
      setPending({ projectId, projectPath, ...file });
      requestOpenIde(projectId);
    },
    [requestOpenIde],
  );
}
