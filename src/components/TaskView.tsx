import { formatDuration, formatTimestamp, taskDurationMs } from "../lib/taskTime";
import type { Task } from "../lib/types";
import { CloseIcon, PencilIcon } from "./Icons";
import { Markdown } from "./Markdown";

const STATUS_LABEL: Record<Task["status"], string> = {
  todo: "To Do",
  inProgress: "In Progress",
  done: "Done",
};

interface TaskViewProps {
  task: Task;
  onClose: () => void;
  onEdit: () => void;
  onToggleCheckbox: (index: number) => void;
}

export function TaskView({ task, onClose, onEdit, onToggleCheckbox }: TaskViewProps) {
  const duration = taskDurationMs(task.startedAt, task.doneAt);
  const hasNotes = task.description.trim().length > 0;
  const hasPrompt = task.prompt.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-[620px] max-w-full flex-col rounded-lg border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
              task.color ? "text-black/80" : "bg-secondary text-muted-foreground"
            }`}
            style={task.color ? { backgroundColor: task.color } : undefined}
          >
            {task.taskId}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">{task.title}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="Edit task"
              onClick={onEdit}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <PencilIcon size={12} />
              Edit
            </button>
            <button
              type="button"
              title="Close"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded bg-secondary/40 px-2.5 py-2 text-[11px] text-muted-foreground">
            <span>
              Status <span className="text-foreground">{STATUS_LABEL[task.status]}</span>
            </span>
            <span>Created {formatTimestamp(task.createdAt)}</span>
            {task.startedAt !== null && <span>Started {formatTimestamp(task.startedAt)}</span>}
            {task.doneAt !== null && <span>Done {formatTimestamp(task.doneAt)}</span>}
            {duration !== null && <span>Took {formatDuration(duration)}</span>}
          </div>

          {hasNotes ? (
            <Markdown source={task.description} onToggleCheckbox={onToggleCheckbox} />
          ) : (
            <p className="text-sm text-muted-foreground/50">No notes yet.</p>
          )}

          {hasPrompt && (
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                AI prompt
              </div>
              <pre className="whitespace-pre-wrap break-words rounded bg-tertiary px-3 py-2.5 font-mono text-xs text-foreground">
                {task.prompt}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
