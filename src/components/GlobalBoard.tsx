import { projectInitials } from "../lib/constants";
import type { Project, TaskStatus } from "../lib/types";
import { BoardIcon, CloseIcon } from "./Icons";
import { COLUMN_ACCENT } from "./taskColors";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "inProgress", label: "In Progress" },
  { status: "done", label: "Done" },
];

interface GlobalBoardProps {
  projects: Project[];
  onSelectProject: (projectId: string) => void;
  onClose: () => void;
}

export function GlobalBoard({ projects, onSelectProject, onClose }: GlobalBoardProps) {
  const totalTasks = projects.reduce((sum, p) => sum + p.tasks.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <BoardIcon size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Overview · All boards</h2>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <CloseIcon size={12} />
          Close
        </button>
      </div>

      {totalTasks === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground no-select">
          No tasks across any project yet.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-4">
          {COLUMNS.map((col) => {
            const accent = COLUMN_ACCENT[col.status];
            const entries = projects
              .map((project) => ({
                project,
                count: project.tasks.filter((t) => t.status === col.status).length,
              }))
              .filter((entry) => entry.count > 0);
            const total = entries.reduce((sum, entry) => sum + entry.count, 0);

            return (
              <div key={col.status} className="flex min-w-0 flex-1 flex-col">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${accent.dot}`} />
                  <h3 className={`text-xs font-semibold uppercase tracking-wide ${accent.header}`}>
                    {col.label}
                  </h3>
                  <span className="rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">
                    {total}
                  </span>
                </div>
                <div
                  className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border p-2 ${accent.column}`}
                >
                  {entries.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground/50 no-select">
                      No projects
                    </p>
                  ) : (
                    entries.map(({ project, count }) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => onSelectProject(project.id)}
                        className={`flex items-center gap-2.5 rounded-md border border-l-2 border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-secondary ${accent.card}`}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-black/80"
                          style={{ backgroundColor: project.color }}
                        >
                          {projectInitials(project.name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                          {project.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {count}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
