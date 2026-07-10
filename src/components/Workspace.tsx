import type { Project } from "../lib/types";

interface WorkspaceProps {
  project: Project | null;
}

export function Workspace({ project }: WorkspaceProps) {
  if (!project) {
    return (
      <main className="flex flex-1 items-center justify-center text-neutral-600 no-select">
        <p className="text-sm">Select a project, or add one with the + button.</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 no-select">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base font-semibold text-black/80"
          style={{ backgroundColor: project.color }}
        >
          {project.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-neutral-100">{project.name}</div>
          <div className="truncate text-xs text-neutral-500">{project.path}</div>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 text-center text-neutral-600 no-select">
        <p className="text-sm">
          No tabs yet. Terminal, Claude, opencode, and IDE tabs arrive in Phase 2.
        </p>
      </div>
    </main>
  );
}
