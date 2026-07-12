import { useEffect, useState } from "react";
import * as git from "../lib/git.ipc";
import type { Project } from "../lib/types";
import { BranchIcon } from "./Icons";

interface StatusBarProps {
  project: Project | null;
  version: string;
}

export function StatusBar({ project, version }: StatusBarProps) {
  const [branch, setBranch] = useState<string | null>(null);
  const [notGitRepo, setNotGitRepo] = useState(false);

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
        className="flex shrink-0 items-center justify-end whitespace-nowrap pr-3"
        style={{ width: "max(var(--git-sidebar-width, 280px), 110px)" }}
      >
        AntanI v{version}
      </div>
    </div>
  );
}
