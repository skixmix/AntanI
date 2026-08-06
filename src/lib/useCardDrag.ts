import type React from "react";
import { useRef, useState } from "react";
import { pastDragThreshold, setBodyDragCursor } from "./dragGesture";
import type { TaskStatus } from "./types";

const COLUMN_ATTR = "data-kanban-column";
const CARD_ATTR = "data-task-id";

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

/** Within `status`'s column, the id of the first card whose vertical midpoint is
 *  below `y` (the card the dragged one should slot before), or `null` for the
 *  column end. The dragged card is skipped so it never targets itself. */
function insertBeforeIn(status: TaskStatus, y: number, draggingId: string | null): string | null {
  const column = document.querySelector<HTMLElement>(`[${COLUMN_ATTR}="${status}"]`);
  if (!column) return null;
  const cards = Array.from(column.querySelectorAll<HTMLElement>(`[${CARD_ATTR}]`));
  for (const card of cards) {
    const id = card.getAttribute(CARD_ATTR);
    if (!id || id === draggingId) continue;
    const rect = card.getBoundingClientRect();
    if (y < (rect.top + rect.bottom) / 2) return id;
  }
  return null;
}

/**
 * Pointer-events card drag for the Kanban board (WKWebView has no working HTML5
 * drag API, the same reason `useDragReorder` exists). A drag both moves a task
 * between columns and positions it within one: on drop it fires
 * `onReorder(taskId, status, beforeId)`, where `beforeId` is the card to slot in
 * front of (or `null` for the column end). A press that never passes
 * `DRAG_THRESHOLD_PX` is treated as a click and fires `onClick` instead, keeping
 * cards clickable. Columns need `data-kanban-column`, cards `data-task-id`.
 */
export function useCardDrag(
  onReorder: (taskId: string, status: TaskStatus, beforeId: string | null) => void,
  onClick?: (taskId: string) => void,
) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const overRef = useRef<TaskStatus | null>(null);
  const beforeRef = useRef<string | null>(null);

  function startDrag(e: React.PointerEvent, taskId: string) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("button, input, textarea, a")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    taskIdRef.current = taskId;
    overRef.current = null;
    beforeRef.current = null;

    function beginDrag() {
      moved = true;
      setDraggingTaskId(taskId);
      setOverStatus(null);
      setInsertBeforeId(null);
      setBodyDragCursor(true);
    }

    function onPointerMove(ev: PointerEvent) {
      if (!moved) {
        if (!pastDragThreshold(ev.clientX - startX, ev.clientY - startY)) return;
        beginDrag();
      }
      const status = columnStatusAt(ev.clientX, ev.clientY);
      if (status !== overRef.current) {
        overRef.current = status;
        setOverStatus(status);
      }
      const before = status ? insertBeforeIn(status, ev.clientY, taskId) : null;
      if (before !== beforeRef.current) {
        beforeRef.current = before;
        setInsertBeforeId(before);
      }
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      setBodyDragCursor(false);
      const id = taskIdRef.current;
      const to = overRef.current;
      const before = beforeRef.current;
      taskIdRef.current = null;
      overRef.current = null;
      beforeRef.current = null;
      setDraggingTaskId(null);
      setOverStatus(null);
      setInsertBeforeId(null);
      if (!moved) {
        if (id) onClick?.(id);
      } else if (id && to) {
        onReorder(id, to, before);
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return { draggingTaskId, overStatus, insertBeforeId, startDrag };
}
