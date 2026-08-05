import { useState } from "react";
import { projectInitials } from "../lib/constants";
import type { AgentKind } from "../lib/tabs";
import type { Project, Task, TaskStatus } from "../lib/types";
import { useCardDrag } from "../lib/useCardDrag";
import { BoardIcon, PlusIcon } from "./Icons";
import { TaskColumn } from "./TaskColumn";
import { TaskEditor } from "./TaskEditor";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "inProgress", label: "In Progress" },
  { status: "done", label: "Done" },
];

interface KanbanBoardProps {
  project: Project;
  onAddTask: (
    title: string,
    description: string,
    taskId: string | null,
    status: TaskStatus,
  ) => void;
  onUpdateTask: (id: string, title: string, description: string, taskId: string) => void;
  onMoveTask: (id: string, status: TaskStatus) => void;
  onRemoveTask: (id: string) => void;
  onClearDone: () => void;
  onSetPrefix: (prefix: string) => void;
  onTrigger: (task: Task, kind: AgentKind) => void;
}

export function KanbanBoard({
  project,
  onAddTask,
  onUpdateTask,
  onMoveTask,
  onRemoveTask,
  onClearDone,
  onSetPrefix,
  onTrigger,
}: KanbanBoardProps) {
  const fallbackPrefix = project.taskPrefix || projectInitials(project.name);
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  const [prefixDraft, setPrefixDraft] = useState(fallbackPrefix);
  const { draggingTaskId, overStatus, startDrag } = useCardDrag(onMoveTask, (taskId) => {
    const task = project.tasks.find((t) => t.id === taskId);
    if (task) setEditing(task);
  });

  const suggestedId = `${fallbackPrefix}-${project.nextTaskSeq + 1}`;
  const existingIds = project.tasks.map((t) => t.taskId);

  function commitPrefix() {
    const next = prefixDraft.trim();
    if (next && next !== project.taskPrefix) onSetPrefix(next);
    else setPrefixDraft(fallbackPrefix);
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-black/80"
          style={{ backgroundColor: project.color }}
        >
          {projectInitials(project.name)}
        </span>
        <BoardIcon size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{project.name} · Board</h2>

        <div className="ml-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>ID prefix</span>
          <input
            value={prefixDraft}
            onChange={(e) => setPrefixDraft(e.currentTarget.value)}
            onBlur={commitPrefix}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-16 rounded bg-secondary px-1.5 py-0.5 text-center font-mono text-foreground outline-none ring-1 ring-border focus:ring-primary"
          />
        </div>

        <button
          type="button"
          onClick={() => setAdding("todo")}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <PlusIcon size={12} />
          New task
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-4">
        {COLUMNS.map((col) => (
          <TaskColumn
            key={col.status}
            status={col.status}
            label={col.label}
            tasks={project.tasks.filter((t) => t.status === col.status)}
            dropActive={draggingTaskId !== null && overStatus === col.status}
            draggingTaskId={draggingTaskId}
            onStartDrag={startDrag}
            onAdd={() => setAdding(col.status)}
            onClearDone={col.status === "done" ? onClearDone : undefined}
            onTrigger={onTrigger}
            onEdit={(task) => setEditing(task)}
            onDelete={(task) => onRemoveTask(task.id)}
          />
        ))}
      </div>

      {(adding !== null || editing !== null) && (
        <TaskEditor
          task={editing}
          suggestedId={suggestedId}
          existingIds={editing ? existingIds.filter((id) => id !== editing.taskId) : existingIds}
          onCancel={() => {
            setAdding(null);
            setEditing(null);
          }}
          onSave={(title, description, taskId) => {
            if (editing) onUpdateTask(editing.id, title, description, taskId ?? editing.taskId);
            else if (adding !== null) onAddTask(title, description, taskId, adding);
            setAdding(null);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
