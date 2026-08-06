import { useState } from "react";
import { projectInitials } from "../lib/constants";
import type { AgentKind } from "../lib/tabs";
import { toggleChecklistItem } from "../lib/taskChecklist";
import type { Project, Task, TaskContent, TaskStatus } from "../lib/types";
import { useCardDrag } from "../lib/useCardDrag";
import { BoardIcon, PlusIcon } from "./Icons";
import { TaskColumn } from "./TaskColumn";
import { TaskEditor } from "./TaskEditor";
import { TaskView } from "./TaskView";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "inProgress", label: "In Progress" },
  { status: "done", label: "Done" },
];

interface KanbanBoardProps {
  project: Project;
  onAddTask: (content: TaskContent, taskId: string | null, status: TaskStatus) => void;
  onUpdateTask: (id: string, content: TaskContent, taskId: string) => void;
  onReorderTask: (id: string, status: TaskStatus, beforeId: string | null) => void;
  onRemoveTask: (id: string) => void;
  onClearDone: () => void;
  onSetPrefix: (prefix: string) => void;
  onTrigger: (task: Task, kind: AgentKind) => void;
}

export function KanbanBoard({
  project,
  onAddTask,
  onUpdateTask,
  onReorderTask,
  onRemoveTask,
  onClearDone,
  onSetPrefix,
  onTrigger,
}: KanbanBoardProps) {
  const fallbackPrefix = project.taskPrefix || projectInitials(project.name);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  const [prefixDraft, setPrefixDraft] = useState(fallbackPrefix);
  const { draggingTaskId, overStatus, insertBeforeId, startDrag } = useCardDrag(
    onReorderTask,
    (id) => setViewingId(id),
  );

  const suggestedId = `${fallbackPrefix}-${project.nextTaskSeq + 1}`;
  const existingIds = project.tasks.map((t) => t.taskId);
  const viewingTask = viewingId ? (project.tasks.find((t) => t.id === viewingId) ?? null) : null;
  const editingTask = editingId ? (project.tasks.find((t) => t.id === editingId) ?? null) : null;

  function commitPrefix() {
    const next = prefixDraft.trim();
    if (next && next !== project.taskPrefix) onSetPrefix(next);
    else setPrefixDraft(fallbackPrefix);
  }

  function toggleChecklist(task: Task, index: number) {
    onUpdateTask(
      task.id,
      {
        title: task.title,
        description: toggleChecklistItem(task.description, index),
        prompt: task.prompt,
        color: task.color,
      },
      task.taskId,
    );
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
            insertBeforeId={insertBeforeId}
            draggingTaskId={draggingTaskId}
            onStartDrag={startDrag}
            onAdd={() => setAdding(col.status)}
            onClearDone={col.status === "done" ? onClearDone : undefined}
            onTrigger={onTrigger}
            onEdit={(task) => {
              setViewingId(null);
              setEditingId(task.id);
            }}
            onDelete={(task) => onRemoveTask(task.id)}
            onToggleCheckbox={toggleChecklist}
          />
        ))}
      </div>

      {viewingTask && !editingTask && adding === null && (
        <TaskView
          task={viewingTask}
          onClose={() => setViewingId(null)}
          onEdit={() => {
            setEditingId(viewingTask.id);
            setViewingId(null);
          }}
          onToggleCheckbox={(index) => toggleChecklist(viewingTask, index)}
        />
      )}

      {(adding !== null || editingTask !== null) && (
        <TaskEditor
          task={editingTask}
          suggestedId={suggestedId}
          existingIds={
            editingTask ? existingIds.filter((id) => id !== editingTask.taskId) : existingIds
          }
          onCancel={() => {
            setAdding(null);
            setEditingId(null);
          }}
          onSave={(content, taskId) => {
            if (editingTask) onUpdateTask(editingTask.id, content, taskId ?? editingTask.taskId);
            else if (adding !== null) onAddTask(content, taskId, adding);
            setAdding(null);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}
