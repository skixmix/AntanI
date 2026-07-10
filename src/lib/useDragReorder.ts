import type React from "react";
import { useRef, useState } from "react";

/**
 * Pointer-events based drag-to-reorder for Tauri/WKWebView.
 *
 * Each draggable item must have:
 *   data-drag-scope="<scope>"
 *   data-drag-id="<id>"
 *
 * Call startDrag(e, id) from onPointerDown.
 *
 * Returns:
 *   draggingId    — id of item being dragged (for lift styling)
 *   insertBeforeId — id of item the dragged item will be inserted *before*,
 *                    or null meaning "append to end"
 *   startDrag
 */
export function useDragReorder(
  scope: string,
  isVertical: boolean,
  onReorder: (fromId: string, insertBeforeId: string | null) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | null | undefined>(undefined);
  const dragIdRef = useRef<string | null>(null);
  const insertRef = useRef<string | null | undefined>(undefined);

  function findInsertBefore(x: number, y: number): string | null {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-drag-scope="${scope}"]`),
    );
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      const mid = isVertical ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2;
      const pos = isVertical ? y : x;
      if (pos < mid) return node.getAttribute("data-drag-id");
    }
    return null;
  }

  function startDrag(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest("button, input")) return;
    e.preventDefault();

    dragIdRef.current = id;
    insertRef.current = undefined;
    setDraggingId(id);
    setInsertBeforeId(undefined);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    function onMove(ev: PointerEvent) {
      const next = findInsertBefore(ev.clientX, ev.clientY);
      if (next !== insertRef.current) {
        insertRef.current = next;
        setInsertBeforeId(next);
      }
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const fromId = dragIdRef.current;
      const before = insertRef.current;
      dragIdRef.current = null;
      insertRef.current = undefined;
      setDraggingId(null);
      setInsertBeforeId(undefined);
      if (fromId && before !== undefined && before !== fromId) {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(`[data-drag-scope="${scope}"]`),
        );
        const ids = nodes.map((n) => n.getAttribute("data-drag-id") as string);
        const filtered = ids.filter((id) => id !== fromId);
        if (before === null) {
          filtered.push(fromId);
        } else {
          const idx = filtered.indexOf(before);
          if (idx !== -1) filtered.splice(idx, 0, fromId);
        }
        const newOrder = filtered;
        const insertBefore = before;
        onReorder(fromId, insertBefore);
        void newOrder;
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return { draggingId, insertBeforeId, startDrag };
}
