import { useEffect, useRef, useState } from "react";
import { formatDuration, formatTimestamp, taskDurationMs } from "../lib/taskTime";
import type { Task } from "../lib/types";

const STATUS_LABEL: Record<Task["status"], string> = {
  todo: "To Do",
  inProgress: "In Progress",
  done: "Done",
};

interface TaskEditorProps {
  task: Task | null;
  suggestedId: string;
  existingIds: string[];
  onCancel: () => void;
  onSave: (title: string, description: string, taskId: string | null) => void;
}

export function TaskEditor({ task, suggestedId, existingIds, onCancel, onSave }: TaskEditorProps) {
  const editing = task !== null;
  const duration = task ? taskDurationMs(task.startedAt, task.doneAt) : null;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [taskId, setTaskId] = useState(task?.taskId ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  const idTrim = taskId.trim();
  const duplicate = idTrim.length > 0 && existingIds.includes(idTrim);
  const idMissing = editing && idTrim.length === 0;
  const valid = title.trim().length > 0 && !duplicate && !idMissing;

  function save() {
    if (!valid) return;
    onSave(title.trim(), description, editing ? idTrim : idTrim || null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[80vh] w-[560px] max-w-full flex-col rounded-lg border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          {editing ? `Edit ${task.taskId}` : "New task"}
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          {task && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded bg-secondary/40 px-2.5 py-2 text-[11px] text-muted-foreground">
              <span>
                Status <span className="text-foreground">{STATUS_LABEL[task.status]}</span>
              </span>
              <span>Created {formatTimestamp(task.createdAt)}</span>
              {task.startedAt !== null && <span>Started {formatTimestamp(task.startedAt)}</span>}
              {task.doneAt !== null && <span>Done {formatTimestamp(task.doneAt)}</span>}
              {duration !== null && <span>Took {formatDuration(duration)}</span>}
            </div>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Title
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              placeholder="Short summary"
              className="rounded bg-secondary px-2 py-1.5 text-sm text-foreground outline-none ring-1 ring-border focus:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Description (sent to the AI as the task brief)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              rows={10}
              placeholder="Full details. Can be long, the AI reads this as the brief."
              className="min-h-32 resize-y rounded bg-secondary px-2 py-1.5 font-mono text-xs text-foreground outline-none ring-1 ring-border focus:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Task ID
            <input
              value={taskId}
              onChange={(e) => setTaskId(e.currentTarget.value)}
              placeholder={editing ? "" : `${suggestedId} (auto)`}
              className={`w-40 rounded bg-secondary px-2 py-1.5 font-mono text-sm text-foreground outline-none ring-1 focus:ring-primary ${
                duplicate ? "ring-destructive" : "ring-border"
              }`}
            />
            {duplicate && <span className="text-destructive">That ID is already used.</span>}
            {!editing && idTrim.length === 0 && (
              <span className="text-muted-foreground/70">
                Leave blank to auto-assign {suggestedId}.
              </span>
            )}
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={save}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {editing ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
