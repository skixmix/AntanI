import type React from "react";
import { type ReactNode, useState } from "react";
import type { AgentKind } from "../lib/tabs";
import { parseChecklist, stripChecklist } from "../lib/taskChecklist";
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
import { Markdown } from "./Markdown";
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
  onToggleCheckbox: (index: number) => void;
}

const iconBtn =
  "flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground";

const CHECKLIST_PREVIEW_CAP = 6;

export function TaskCard({
  task,
  dragging,
  onStartDrag,
  onTrigger,
  onEdit,
  onDelete,
  onToggleCheckbox,
}: TaskCardProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ x: number; y: number } | null>(null);
  const duration = taskDurationMs(task.startedAt, task.doneAt);
  const isDone = task.status === "done";
  const ageDays = daysBetween(task.enteredColumnAt ?? task.updatedAt, Date.now());
  const ageLevel = columnAgeLevel(ageDays);
  const accent = COLUMN_ACCENT[task.status];

  const notes = stripChecklist(task.description);
  const checklist = parseChecklist(task.description);
  const doneCount = checklist.filter((item) => item.checked).length;
  const hasPrompt = task.prompt.trim().length > 0;

  return (
    <div
      data-task-id={task.id}
      onPointerDown={onStartDrag}
      className={`group cursor-grab rounded-md border border-l-2 border-border ${accent.card} bg-card p-2.5 shadow-sm transition-opacity ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
            task.color ? "text-black/80" : "bg-secondary text-muted-foreground"
          }`}
          style={task.color ? { backgroundColor: task.color } : undefined}
        >
          {task.taskId}
        </span>
        {hasPrompt && (
          <span
            title="Has an AI prompt"
            className="flex items-center gap-0.5 rounded bg-secondary px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <PromptIcon size={9} />
            AI
          </span>
        )}
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
      {notes && (
        <div className="mt-1 max-h-24 overflow-hidden text-muted-foreground">
          <Markdown source={notes} />
        </div>
      )}

      {checklist.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {checklist.slice(0, CHECKLIST_PREVIEW_CAP).map((item, i) => (
            <button
              key={item.line}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCheckbox(i);
              }}
              className="flex items-start gap-1.5 text-left text-xs"
            >
              <span
                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                  item.checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40"
                }`}
              >
                {item.checked && (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="M2.5 6.5l2.5 2.5 4.5-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span
                className={`line-clamp-2 ${
                  item.checked ? "text-muted-foreground/50 line-through" : "text-foreground/90"
                }`}
              >
                {item.text}
              </span>
            </button>
          ))}
          {checklist.length > CHECKLIST_PREVIEW_CAP && (
            <span className="pl-5 text-[10px] text-muted-foreground/60">
              +{checklist.length - CHECKLIST_PREVIEW_CAP} more
            </span>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
        {!isDone && (
          <span className={`font-medium ${AGE_CLASS[ageLevel]}`} title="Time in this column">
            {ageDays === 0 ? "new today" : `${ageDays}d in column`}
          </span>
        )}
        {checklist.length > 0 && (
          <span title="Checklist progress">
            ✓ {doneCount}/{checklist.length}
          </span>
        )}
        <span title={`Created ${formatTimestamp(task.createdAt)}`}>
          {formatTimestamp(task.createdAt)}
        </span>
        {duration !== null && <span title="In progress → done">· {formatDuration(duration)}</span>}
        {!isDone && hasPrompt && (
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
