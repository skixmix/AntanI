import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import * as api from "../lib/api.ipc";
import * as git from "../lib/git.ipc";
import type { Project } from "../lib/types";
import { RELEASES_PAGE_URL } from "../lib/updateCheck.ipc";
import { BranchIcon } from "./Icons";

interface StatusBarProps {
  project: Project | null;
  version: string;
  updateVersion: string | null;
}

export function StatusBar({ project, version, updateVersion }: StatusBarProps) {
  const [branch, setBranch] = useState<string | null>(null);
  const [notGitRepo, setNotGitRepo] = useState(false);
  const [updateMenuOpen, setUpdateMenuOpen] = useState(false);

  useEffect(() => {
    if (!updateMenuOpen) return;
    const close = () => setUpdateMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [updateMenuOpen]);

  useEffect(() => {
    setBranch(null);
    setNotGitRepo(false);
    if (!project) return;
    void git
      .gitStatus(project.path)
      .then((s) => setBranch(s.branch))
      .catch((e) => setNotGitRepo(git.isNotGitRepoError(String(e))));
  }, [project]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void git
      .onGitStatusChanged((event) => {
        if (project && event.projectId === project.id) setBranch(event.status.branch);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [project]);

  const branchLabel = branch
    ? branch
    : !project
      ? "No project selected"
      : notGitRepo
        ? "Not a git repository"
        : "Git status unavailable";

  return (
    <div
      className="flex h-6 w-full shrink-0 items-center text-[11px] text-muted-foreground no-select"
      style={{
        borderTop: "1px solid var(--color-sidebar-border)",
        background: project ? `${project.color}26` : "var(--color-sidebar)",
      }}
    >
      <div className="shrink-0" style={{ width: "var(--sidebar-width, 260px)" }} />
      <div className="flex flex-1 items-center justify-center gap-1.5 truncate px-2">
        <BranchIcon size={11} className="shrink-0" />
        <span className="truncate">{branchLabel}</span>
      </div>
      <div
        className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap pr-3"
        style={{ width: "max(var(--git-sidebar-width, 280px), 110px)" }}
      >
        {updateVersion && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setUpdateMenuOpen((open) => !open);
              }}
              className="rounded-full bg-primary px-1.5 py-px text-[10px] text-primary-foreground no-select"
              title={`AntanI v${updateVersion} is available`}
            >
              Update available
            </button>
            {updateMenuOpen && (
              <div
                className="absolute right-0 bottom-full mb-1 min-w-40 rounded-lg border border-border bg-popover p-1 text-xs shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="block w-full rounded px-2 py-1.5 text-left text-foreground hover:bg-secondary"
                  onClick={() => {
                    setUpdateMenuOpen(false);
                    void openUrl(RELEASES_PAGE_URL);
                  }}
                >
                  View release notes
                </button>
                <button
                  type="button"
                  className="block w-full rounded px-2 py-1.5 text-left text-foreground hover:bg-secondary"
                  onClick={() => {
                    setUpdateMenuOpen(false);
                    void api.runBrewUpgrade();
                  }}
                >
                  Update now
                </button>
              </div>
            )}
          </div>
        )}
        <span>AntanI v{version}</span>
      </div>
    </div>
  );
}
