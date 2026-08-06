import type React from "react";
import { Fragment, useState } from "react";
import type { AgentKind } from "../lib/tabs";
import type { Task, TaskStatus } from "../lib/types";
import { ConfirmPopover } from "./ConfirmPopover";
import { PlusIcon, TrashIcon } from "./Icons";
import { TaskCard } from "./TaskCard";
import { COLUMN_ACCENT } from "./taskColors";

interface TaskColumnProps {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  dropActive: boolean;
  insertBeforeId: string | null;
  draggingTaskId: string | null;
  onStartDrag: (e: React.PointerEvent, taskId: string) => void;
  onAdd: () => void;
  onClearDone?: () => void;
  onTrigger: (task: Task, kind: AgentKind) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleCheckbox: (task: Task, index: number) => void;
}

export function TaskColumn({
  status,
  label,
  tasks,
  dropActive,
  insertBeforeId,
  draggingTaskId,
  onStartDrag,
  onAdd,
  onClearDone,
  onTrigger,
  onEdit,
  onDelete,
  onToggleCheckbox,
}: TaskColumnProps) {
  const [confirm, setConfirm] = useState<{ x: number; y: number } | null>(null);
  const accent = COLUMN_ACCENT[status];

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={`h-2 w-2 shrink-0 rounded-full ${accent.dot}`} />
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${accent.header}`}>
          {label}
        </h3>
        <span className="rounded-full bg-secondary px-1.5 text-[10px] text-muted-foreground">
          {tasks.length}
        </span>
        {onClearDone && tasks.length > 0 && (
          <button
            type="button"
            title="Delete all done tasks"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setConfirm({ x: r.left, y: r.bottom + 4 });
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-red-400"
          >
            <TrashIcon size={11} />
            Delete all
          </button>
        )}
        <button
          type="button"
          title={`Add task to ${label}`}
          onClick={onAdd}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <PlusIcon size={12} />
        </button>
      </div>
      <div
        data-kanban-column={status}
        className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border p-2 transition-colors ${
          dropActive ? "border-primary bg-primary/5" : accent.column
        }`}
      >
        {tasks.map((task) => (
          <Fragment key={task.id}>
            {dropActive && insertBeforeId === task.id && (
              <div className="h-0.5 shrink-0 rounded-full bg-primary" />
            )}
            <TaskCard
              task={task}
              dragging={draggingTaskId === task.id}
              onStartDrag={(e) => onStartDrag(e, task.id)}
              onTrigger={(kind) => onTrigger(task, kind)}
              onEdit={() => onEdit(task)}
              onDelete={() => onDelete(task)}
              onToggleCheckbox={(index) => onToggleCheckbox(task, index)}
            />
          </Fragment>
        ))}
        {dropActive && insertBeforeId === null && tasks.length > 0 && (
          <div className="h-0.5 shrink-0 rounded-full bg-primary" />
        )}
        {tasks.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground/50 no-select">
            {dropActive ? "Release to drop here" : "No tasks"}
          </p>
        )}
      </div>
      {confirm && (
        <ConfirmPopover
          x={confirm.x}
          y={confirm.y}
          message={`Delete all ${tasks.length} done ${tasks.length === 1 ? "task" : "tasks"}? This can't be undone.`}
          confirmLabel="Delete all"
          onConfirm={() => {
            onClearDone?.();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
