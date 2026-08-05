import type React from "react";
import { useRef, useState } from "react";
import type { TaskStatus } from "./types";

const COLUMN_ATTR = "data-kanban-column";
const DRAG_THRESHOLD_PX = 4;

function columnStatusAt(x: number, y: number): TaskStatus | null {
  const columns = Array.from(document.querySelectorAll<HTMLElement>(`[${COLUMN_ATTR}]`));
  for (const column of columns) {
    const rect = column.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const status = column.getAttribute(COLUMN_ATTR);
      if (status === "todo" || status === "inProgress" || status === "done") return status;
    }
  }
  return null;
}

/**
 * Pointer-events card drag for moving a task between Kanban columns (WKWebView
 * has no working HTML5 drag API — same reason `useDragReorder` exists). Each
 * column must carry `data-kanban-column="<status>"`; dropping a card over a
 * different column fires `onMove` with that column's status. A drop on the
 * origin column, or outside any column, is a no-op. A press that never moves
 * past `DRAG_THRESHOLD_PX` is treated as a click and fires `onClick` instead,
 * so the card stays clickable without a competing HTML5 click handler.
 */
export function useCardDrag(
  onMove: (taskId: string, status: TaskStatus) => void,
  onClick?: (taskId: string) => void,
) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const fromStatusRef = useRef<TaskStatus | null>(null);
  const overRef = useRef<TaskStatus | null>(null);

  function startDrag(e: React.PointerEvent, taskId: string, currentStatus: TaskStatus) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("button, input, textarea, a")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    taskIdRef.current = taskId;
    fromStatusRef.current = currentStatus;
    overRef.current = null;

    function beginDrag() {
      moved = true;
      setDraggingTaskId(taskId);
      setOverStatus(null);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    }

    function onPointerMove(ev: PointerEvent) {
      if (!moved) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= DRAG_THRESHOLD_PX) return;
        beginDrag();
      }
      const status = columnStatusAt(ev.clientX, ev.clientY);
      if (status !== overRef.current) {
        overRef.current = status;
        setOverStatus(status);
      }
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const id = taskIdRef.current;
      const from = fromStatusRef.current;
      const to = overRef.current;
      taskIdRef.current = null;
      fromStatusRef.current = null;
      overRef.current = null;
      setDraggingTaskId(null);
      setOverStatus(null);
      if (!moved) {
        if (id) onClick?.(id);
      } else if (id && to && to !== from) {
        onMove(id, to);
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return { draggingTaskId, overStatus, startDrag };
}
