import type React from "react";
import { type ReactNode, useState } from "react";
import type { AgentKind } from "../lib/tabs";
import {
  columnAgeLevel,
  daysBetween,
  formatDuration,
  formatTimestamp,
  taskDurationMs,
} from "../lib/taskTime";
import type { Task } from "../lib/types";
import { ConfirmPopover } from "./ConfirmPopover";
import { ContextMenu } from "./ContextMenu";
import { AnthropicIcon, CodexIcon, OpenCodeIcon, PencilIcon, PromptIcon, TrashIcon } from "./Icons";
import { COLUMN_ACCENT } from "./taskColors";

const AGENTS: { kind: AgentKind; label: string; icon: ReactNode }[] = [
  { kind: "opencode", label: "OpenCode", icon: <OpenCodeIcon size={13} /> },
  { kind: "claude", label: "Claude", icon: <AnthropicIcon size={13} /> },
  { kind: "codex", label: "Codex", icon: <CodexIcon size={13} /> },
];

const AGE_CLASS: Record<"fresh" | "aging" | "stale", string> = {
  fresh: "text-muted-foreground/70",
  aging: "text-amber-500",
  stale: "text-red-400",
};

interface TaskCardProps {
  task: Task;
  dragging: boolean;
  onStartDrag: (e: React.PointerEvent) => void;
  onTrigger: (kind: AgentKind) => void;
  onEdit: () => void;
  onDelete: () => void;
}

const iconBtn =
  "flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground";

export function TaskCard({
  task,
  dragging,
  onStartDrag,
  onTrigger,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ x: number; y: number } | null>(null);
  const duration = taskDurationMs(task.startedAt, task.doneAt);
  const isDone = task.status === "done";
  const ageDays = daysBetween(task.enteredColumnAt ?? task.updatedAt, Date.now());
  const ageLevel = columnAgeLevel(ageDays);
  const accent = COLUMN_ACCENT[task.status];

  return (
    <div
      onPointerDown={onStartDrag}
      className={`group cursor-grab rounded-md border border-l-2 border-border ${accent.card} bg-card p-2.5 shadow-sm transition-opacity ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
          {task.taskId}
        </span>
        <div
          className={`ml-auto flex items-center gap-1 transition-opacity ${
            isDone ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            title="Edit task"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className={iconBtn}
          >
            <PencilIcon size={12} />
          </button>
          <button
            type="button"
            title="Delete task"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setConfirmDelete({ x: r.left, y: r.bottom + 4 });
            }}
            className={iconBtn}
          >
            <TrashIcon size={12} />
          </button>
        </div>
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm font-medium text-foreground">{task.title}</p>
      {task.description && (
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">
          {task.description}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
        {!isDone && (
          <span className={`font-medium ${AGE_CLASS[ageLevel]}`} title="Time in this column">
            {ageDays === 0 ? "new today" : `${ageDays}d in column`}
          </span>
        )}
        <span title={`Created ${formatTimestamp(task.createdAt)}`}>
          {formatTimestamp(task.createdAt)}
        </span>
        {duration !== null && <span title="In progress → done">· {formatDuration(duration)}</span>}
        {!isDone && (
          <button
            type="button"
            title="Start this task on a new AI panel"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom + 4 });
            }}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-primary hover:bg-secondary"
          >
            <PromptIcon size={12} />
            Send to AI
          </button>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={AGENTS.map((agent) => ({
            label: `Start with ${agent.label}`,
            icon: agent.icon,
            onSelect: () => onTrigger(agent.kind),
          }))}
        />
      )}

      {confirmDelete && (
        <ConfirmPopover
          x={confirmDelete.x}
          y={confirmDelete.y}
          message={`Delete task ${task.taskId}? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            onDelete();
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
